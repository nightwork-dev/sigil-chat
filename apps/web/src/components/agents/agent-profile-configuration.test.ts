import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentConfiguration } from "./agent-profile";
import type { AgentCatalog } from "@/lib/agent-catalog";

describe("AgentConfiguration", () => {
  it("renders the loaded Eve configuration as a read-only safe summary", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentConfiguration, { catalog: catalogFixture() }),
    );

    expect(markup).toContain("codex/example-model");
    expect(markup).toContain("Root instructions");
    expect(markup).toContain("12 lines");
    expect(markup).toContain("workspace-tools");
    expect(markup).toContain("Workspace application tools.");
    expect(markup).toContain("review-critic");
    expect(markup).toContain(
      "instructions loaded · 1 skill · 2 tools · 0 connections",
    );

    expect(markup).not.toContain("authorization");
    expect(markup).not.toMatch(/<(button|form|input|select|textarea)\b/u);
  });

  it("shows honest empty states when Eve has not loaded optional configuration", () => {
    const catalog = catalogFixture();
    catalog.agent.instructions = {
      loaded: false,
      lines: 0,
      dynamicResolvers: 0,
    };
    catalog.connections = [];
    catalog.subagents = [];

    const markup = renderToStaticMarkup(
      createElement(AgentConfiguration, { catalog }),
    );

    expect(markup).toContain("Not loaded");
    expect(markup).toContain("No connections loaded.");
    expect(markup).toContain("No subagents loaded.");
  });
});

function catalogFixture(): AgentCatalog {
  return {
    agent: {
      name: "Embedded agent",
      model: "codex/example-model",
      instructions: {
        loaded: true,
        name: "Root instructions",
        lines: 12,
        dynamicResolvers: 0,
      },
    },
    connections: [
      {
        id: "workspace-tools",
        name: "workspace-tools",
        description: "Workspace application tools.",
        protocol: "mcp",
      },
    ],
    skills: [],
    subagents: [
      {
        id: "review-critic",
        name: "review-critic",
        description: "Provide an independent second reading.",
        origin: "eve-declared",
        availability: "available",
        capabilities: ["read", "delegate"],
        runtimeStatus: "delegatable",
        summary: {
          instructions: true,
          skills: 1,
          tools: 2,
          connections: 0,
        },
      },
    ],
    runtimeTools: [],
    tools: [],
    management: {
      source: "eve-inspection",
      lifecycle: "unavailable",
      explanation: "Read-only inspection.",
    },
    diagnostics: { errors: 0, warnings: 0 },
  };
}
