import { describe, expect, it } from "vitest";

import {
  fetchAgentCatalogFromEve,
  projectAgentCatalog,
} from "./agent-catalog";

describe("agent catalog projection", () => {
  it("authenticates Eve inspection with the verified session token", async () => {
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer verified-eve-token",
      );
      return Response.json({ agent: { name: "Sigil Chat" } });
    };

    await expect(
      fetchAgentCatalogFromEve(
        "http://sigil-chat-agent.localhost:1355/eve/v1/info",
        "verified-eve-token",
        fetcher as typeof fetch,
      ),
    ).resolves.toMatchObject({ agent: { name: "Sigil Chat" } });
  });

  it("fails closed when Eve rejects inspection credentials", async () => {
    const fetcher = async () =>
      new Response(null, { status: 401, statusText: "Unauthorized" });

    await expect(
      fetchAgentCatalogFromEve(
        "http://sigil-chat-agent.localhost:1355/eve/v1/info",
        "rejected-token",
        fetcher as typeof fetch,
      ),
    ).rejects.toThrow("Eve agent inspection failed (401 Unauthorized)");
  });

  it("distinguishes model-discoverable skills from delegatable subagents", () => {
    const catalog = projectAgentCatalog({
      agent: { name: "Sigil Chat", model: { id: "local-codex" } },
      skills: {
        static: [
          {
            name: "editorial-readiness",
            description: "Review launch readiness.",
            logicalPath: "skills/editorial-readiness/SKILL.md",
          },
        ],
        dynamic: [],
      },
      subagents: {
        local: [
          {
            name: "review-critic",
            description: "Provide an independent second reading.",
            summary: {
              instructions: true,
              skills: 0,
              tools: 0,
              connections: 0,
            },
          },
        ],
      },
      diagnostics: { discoveryErrors: 0, discoveryWarnings: 0 },
    });

    expect(catalog.skills[0]).toMatchObject({
      name: "editorial-readiness",
      runtimeStatus: "model-discoverable",
      capabilities: ["read"],
    });
    expect(catalog.subagents[0]).toMatchObject({
      name: "review-critic",
      runtimeStatus: "delegatable",
      capabilities: ["read", "delegate"],
    });
  });

  it("does not expose host filesystem paths through the browser catalog", () => {
    const catalog = projectAgentCatalog({
      skills: {
        static: [
          {
            name: "safe-skill",
            logicalPath: "skills/safe-skill/SKILL.md",
          },
          {
            name: "private-skill",
            logicalPath: "/Users/operator/.eve/skills/private/SKILL.md",
          },
        ],
      },
      subagents: {
        local: [
          {
            name: "escaped-agent",
            logicalPath: "../private/agent.md",
          },
        ],
      },
    });

    expect(catalog.skills[0]?.sourcePath).toBe("skills/safe-skill/SKILL.md");
    expect(catalog.skills[1]?.sourcePath).toBeUndefined();
    expect(catalog.subagents[0]?.sourcePath).toBeUndefined();
  });
});
