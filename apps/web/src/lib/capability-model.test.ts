import { describe, expect, it } from "vitest"

import type { AgentCatalog } from "./agent-catalog"
import { filterCapabilityGroups, projectCapabilityGroups } from "./capability-model"

const catalog: AgentCatalog = {
  agent: {
    name: "Eve",
    instructions: { loaded: true, lines: 1, dynamicResolvers: 0 },
  },
  connections: [],
  skills: [
    {
      id: "editorial-readiness",
      name: "editorial-readiness",
      description: "Review a launch.",
      origin: "eve-authored",
      availability: "available",
      capabilities: ["read"],
      runtimeStatus: "model-discoverable",
    },
  ],
  subagents: [],
  runtimeTools: [
    {
      id: "eve__todo",
      name: "todo",
      description: "Track current work.",
      origin: "eve-framework",
      availability: "available",
      runtimeStatus: "callable",
      requiresApproval: false,
    },
    {
      id: "eve__connection_search",
      name: "connection_search",
      description: "Discover connected tools.",
      origin: "eve-framework",
      availability: "available",
      runtimeStatus: "discoverable",
      requiresApproval: false,
    },
  ],
  tools: [
    {
      id: "gonk__sigil-generate-image",
      name: "sigil-generate-image",
      description: "Generate a new image.",
      origin: "gonk",
      availability: "available",
      runtimeStatus: "callable",
    },
    {
      id: "gonk__sigil-review-inspect",
      name: "sigil-review-inspect",
      description: "Inspect a review document.",
      origin: "gonk",
      availability: "available",
      runtimeStatus: "callable",
    },
  ],
  management: {
    source: "eve-inspection",
    lifecycle: "unavailable",
    explanation: "Not relevant to this projection.",
  },
  diagnostics: { errors: 0, warnings: 0 },
}

describe("capability presentation model", () => {
  it("groups live runtime and Gonk items by the outcome they support", () => {
    const groups = projectCapabilityGroups(catalog, "ask", {
      "gonk__sigil-generate-image": "always",
    })

    expect(groups.find((group) => group.id === "planning")?.items).toEqual([
      expect.objectContaining({
        name: "Todo",
        source: "Eve runtime",
        scope: "Current session",
      }),
    ])
    expect(groups.find((group) => group.id === "images")?.items).toEqual([
      expect.objectContaining({
        name: "Generate Image",
        source: "Gonk application tool",
        consent: "Runs without a prompt",
      }),
    ])
    expect(groups.find((group) => group.id === "connected-tools")?.items).toEqual([
      expect.objectContaining({ availability: "Discoverable" }),
    ])
  })

  it("filters a grouped catalog without duplicating matching rows", () => {
    const groups = projectCapabilityGroups(catalog, "ask", {})

    expect(filterCapabilityGroups(groups, "review document")).toEqual([
      expect.objectContaining({
        id: "review",
        items: [expect.objectContaining({ name: "Review Inspect" })],
      }),
    ])
  })
})
