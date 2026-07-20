import { describe, expect, it, vi } from "vitest";

import type { SigilAuthSession } from "./auth/server";
import {
  readSystemStatus,
  type SystemStatusDependencies,
} from "./system-status.server";

const ownerSession = {
  user: { id: "owner-1", role: "owner" },
} as SigilAuthSession;

function dependencies(
  overrides: Partial<SystemStatusDependencies> = {},
): SystemStatusDependencies {
  return {
    checkWeb: async () => undefined,
    fetcher: async () => new Response(null, { status: 200 }),
    getEveToken: async () => "eve-token",
    getSession: async () => ownerSession,
    now: () => new Date("2026-07-20T12:00:00.000Z"),
    readEnvironment: () => ({
      eveOrigin: "https://agent.example.test",
      gonkApiKey: "gonk-key",
      gonkMcpUrl: "https://tools.example.test/mcp",
    }),
    ...overrides,
  };
}

describe("system status server boundary", () => {
  it("denies a non-owner before probing any service", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      readSystemStatus(
        dependencies({
          fetcher,
          getSession: async () =>
            ({ user: { id: "member-1", role: "member" } }) as SigilAuthSession,
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses authenticated bounded readiness probes at the expected URLs", async () => {
    const requests: Array<{
      authorization: string | null;
      signal: AbortSignal;
      url: string;
    }> = [];
    const result = await readSystemStatus(
      dependencies({
        fetcher: async (input, init) => {
          const headers = new Headers(init?.headers);
          requests.push({
            authorization: headers.get("authorization"),
            signal: init?.signal as AbortSignal,
            url: String(input),
          });
          return new Response(null, { status: 200 });
        },
      }),
    );

    expect(
      requests.map(({ authorization, url }) => ({ authorization, url })),
    ).toEqual([
      {
        authorization: "Bearer eve-token",
        url: "https://agent.example.test/sigil/v1/readiness",
      },
      {
        authorization: "Bearer gonk-key",
        url: "https://tools.example.test/health",
      },
    ]);
    expect(requests.every(({ signal }) => signal instanceof AbortSignal)).toBe(
      true,
    );
    expect(
      result.services.every((service) => service.status === "healthy"),
    ).toBe(true);
  });

  it("reports Eve unhealthy when model-aware readiness fails", async () => {
    const result = await readSystemStatus(
      dependencies({
        fetcher: async (input) =>
          new Response(null, {
            status: String(input).includes("/sigil/v1/readiness") ? 503 : 200,
          }),
      }),
    );

    expect(
      result.services.find((service) => service.id === "eve")?.status,
    ).toBe("unhealthy");
  });
});
