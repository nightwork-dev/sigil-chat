import { describe, expect, it } from "vitest";

import {
  agentCatalogKeys,
  agentCatalogQueryOptions,
  agentRuntimeCatalogQueryOptions,
  fetchAgentCatalogFromEve,
  fetchGonkToolCatalog,
  projectAgentCatalog,
} from "./agent-catalog";

describe("agent catalog projection", () => {
  it("keeps Eve inspection on an independent query from the Gonk tool catalog", () => {
    expect(agentRuntimeCatalogQueryOptions().queryKey).toEqual(
      agentCatalogKeys.info(),
    );
    expect(agentCatalogQueryOptions().queryKey).toEqual(agentCatalogKeys.full());
    expect(agentRuntimeCatalogQueryOptions().queryKey).not.toEqual(
      agentCatalogQueryOptions().queryKey,
    );
  });

  it("authenticates Eve inspection with the verified session token", async () => {
    const fetcher = (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer verified-eve-token",
      );
      return Promise.resolve(Response.json({ agent: { name: "Sigil Chat" } }));
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
    const fetcher = () =>
      Promise.resolve(
        new Response(null, { status: 401, statusText: "Unauthorized" }),
      );

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
      instructions: {
        static: {
          name: "Root instructions",
          markdown: "instruction-body-sentinel\nSecond line.\n",
          logicalPath: "host-root-sentinel/instructions.md",
        },
        dynamic: [
          { slug: "context", logicalPath: "host-root-sentinel/context.ts" },
        ],
      },
      connections: [
        {
          connectionName: "workspace-tools",
          description: "Workspace application tools.",
          protocol: "mcp",
          url: "http://service.invalid/mcp",
          headers: { authorization: "Bearer credential-sentinel" },
        },
      ],
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
      tools: {
        available: [
          {
            name: "web_search",
            description: "Search the web.",
            origin: "framework",
            requiresApproval: false,
          },
        ],
        dynamic: [
          {
            slug: "connection_search",
            description: "Discover connected application tools.",
            origin: "framework",
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
    expect(catalog.agent).toMatchObject({
      model: "local-codex",
      instructions: {
        loaded: true,
        name: "Root instructions",
        lines: 2,
        dynamicResolvers: 1,
      },
    });
    expect(catalog.connections).toEqual([
      {
        id: "workspace-tools",
        name: "workspace-tools",
        description: "Workspace application tools.",
        protocol: "mcp",
      },
    ]);
    expect(catalog.runtimeTools).toEqual([
      expect.objectContaining({
        name: "web_search",
        origin: "eve-framework",
        runtimeStatus: "callable",
      }),
      expect.objectContaining({
        name: "connection_search",
        runtimeStatus: "discoverable",
      }),
    ]);

    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain("service.invalid");
    expect(serialized).not.toContain("credential-sentinel");
    expect(serialized).not.toContain("host-root-sentinel");
    expect(serialized).not.toContain("instruction-body-sentinel");
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
            logicalPath: "/workspace/operator/.eve/skills/private/SKILL.md",
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

  it("represents missing instructions and connections without inventing configuration", () => {
    const catalog = projectAgentCatalog({});

    expect(catalog.agent.instructions).toEqual({
      loaded: false,
      name: undefined,
      lines: 0,
      dynamicResolvers: 0,
    });
    expect(catalog.connections).toEqual([]);
    expect(catalog.runtimeTools).toEqual([]);
  });

  it("lists authenticated Gonk tools under Eve's qualified runtime names", async () => {
    let call = 0;
    const fetcher = (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer gonk-service-token",
      );
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          Response.json({}, { headers: { "mcp-session-id": "session-1" } }),
        );
      }
      if (call === 2)
        return Promise.resolve(new Response(null, { status: 202 }));
      if (call === 3) {
        return Promise.resolve(
          Response.json({
            result: {
              tools: [
                {
                  name: "sigil-read-file",
                  description: "Read a session file.",
                },
              ],
            },
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    };

    await expect(
      fetchGonkToolCatalog(
        "http://sigil-chat-gonk.localhost:1355/mcp",
        "gonk-service-token",
        fetcher as typeof fetch,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "gonk__sigil-read-file",
        name: "sigil-read-file",
        runtimeStatus: "callable",
      }),
    ]);
    expect(call).toBe(4);
  });
});
