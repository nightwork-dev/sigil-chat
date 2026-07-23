import { describe, expect, it } from "vitest"

import type { AgentCatalog } from "./agent-catalog"
import {
  filterCapabilityGroups,
  projectCapabilityGroups,
} from "./capability-model"

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
      origin: "host-authored",
      availability: "available",
      capabilities: ["read"],
      runtimeStatus: "model-discoverable",
    },
  ],
  subagents: [],
  runtimeTools: [
    {
      id: "runtime__recall_read",
      name: "recall_read",
      description: "Recall accepted memories.",
      origin: "host-authored",
      availability: "available",
      runtimeStatus: "callable",
      requiresApproval: false,
    },
    {
      id: "runtime__remember",
      name: "remember",
      description: "Remember an accepted fact.",
      origin: "host-authored",
      availability: "available",
      runtimeStatus: "callable",
      requiresApproval: false,
    },
    {
      id: "runtime__todo",
      name: "todo",
      description: "Track current work.",
      origin: "host-framework",
      availability: "available",
      runtimeStatus: "callable",
      requiresApproval: false,
    },
    {
      id: "runtime__connection_search",
      name: "connection_search",
      description: "Discover connected tools.",
      origin: "host-framework",
      availability: "available",
      runtimeStatus: "discoverable",
      requiresApproval: false,
    },
  ],
  tools: [
    {
      id: "sigil-generate-image",
      name: "sigil-generate-image",
      description: "Generate a new image.",
      origin: "application",
      availability: "available",
      runtimeStatus: "callable",
    },
    {
      id: "sigil-review-inspect",
      name: "sigil-review-inspect",
      description: "Inspect a review document.",
      origin: "application",
      availability: "available",
      runtimeStatus: "callable",
    },
  ],
  management: {
    source: "agent-inspection",
    lifecycle: "unavailable",
    explanation: "Not relevant to this projection.",
  },
  diagnostics: { errors: 0, warnings: 0 },
}

describe("capability presentation model", () => {
  it("groups live runtime and Gonk items by the outcome they support", () => {
    const groups = projectCapabilityGroups(catalog, "ask", {
      "sigil-generate-image": "always",
    })

    expect(groups.find((group) => group.id === "planning")?.items).toEqual([
      expect.objectContaining({
        name: "Todo",
        source: "Agent runtime",
        scope: "Current session",
      }),
    ])
    expect(groups.find((group) => group.id === "images")?.items).toEqual([
      expect.objectContaining({
        name: "Generate Image",
        source: "Application tool",
        consent: "Runs without a prompt",
      }),
    ])
    expect(
      groups.find((group) => group.id === "connected-tools")?.items,
    ).toEqual([expect.objectContaining({ availability: "Discoverable" })])
    expect(groups.find((group) => group.id === "agent-memory")?.items).toEqual([
      expect.objectContaining({
        id: "runtime__durable-memory",
        name: "Durable Memory",
        scope: "Authorized memory scope",
      }),
    ])
    expect(
      groups.flatMap((group) => group.items.map((item) => item.id)),
    ).not.toContain("runtime__remember")
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
