import { describe, expect, it, vi } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import {
  listArtifacts,
  readArtifactPreview,
  type ArtifactAccessDependencies,
} from "./artifacts.server"

const session = {
  user: { id: "user-1", role: "member" },
} as SigilAuthSession

function dependencies(
  overrides: Partial<ArtifactAccessDependencies> = {},
): ArtifactAccessDependencies {
  return {
    fetcher: () =>
      Promise.resolve(
        new Response("[]", { headers: { "content-type": "application/json" } }),
      ),
    getSession: () => Promise.resolve(session),
    ownedThreadHomeScope: (userId, threadId) =>
      userId === "user-1" && threadId === "thread-1"
        ? "personal-scope:user-1"
        : undefined,
    readEnvironment: () => ({
      apiKey: "service-key",
      gonkMcpUrl: "https://tools.example.test/mcp",
    }),
    ...overrides,
  }
}

describe("artifact workspace access", () => {
  it("lists an owned session scope through the service bearer", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: "file-1",
              filename: "notes.md",
              mediaType: "text/markdown",
              size: 4,
              createdAt: "2026-07-20T00:00:00.000Z",
            },
          ]),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    )
    const artifacts = await listArtifacts(
      "session:thread-1",
      dependencies({ fetcher }),
    )
    expect(artifacts).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledWith(
      "https://tools.example.test/artifacts",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer service-key",
          "x-sigil-scope": "session:thread-1",
        }),
      }),
    )
  })

  it("denies an unowned scope before it contacts Gonk", async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      listArtifacts("session:thread-2", dependencies({ fetcher })),
    ).rejects.toThrow("Agent session was not found")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("returns an in-app textual preview through the authenticated byte route", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response("A useful source note", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      ),
    )
    await expect(
      readArtifactPreview(
        { scope: "project:evidence-room", id: "file-1" },
        dependencies({ fetcher }),
      ),
    ).resolves.toEqual({
      kind: "text",
      mediaType: "text/plain",
      content: "A useful source note",
      truncated: false,
    })
    expect(fetcher).toHaveBeenCalledWith(
      "https://tools.example.test/img/file-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-sigil-scope": "project:evidence-room",
        }),
      }),
    )
  })
})
