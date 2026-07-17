import { describe, expect, it } from "vitest";

import { projectAgentCatalog } from "./agent-catalog";

describe("agent catalog projection", () => {
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
