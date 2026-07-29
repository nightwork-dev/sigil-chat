import { describe, expect, it } from "vitest"

import {
  AGENT_CONTEXT_COMPILE_RECEIPT_EVENT,
  AGENT_CONTEXT_COMPILE_RECEIPT_VERSION,
  isAgentContextCompileReceiptEvent,
  projectAgentContextReceiptForRole,
  type AgentContextCompileReceipt,
} from "./context-receipt"

describe("agent context compile receipt contract", () => {
  it("projects withheld material without leaking existence category or count", () => {
    const receipt = fixtureReceipt()

    const projection = projectAgentContextReceiptForRole(receipt, "assistant")
    const serialized = JSON.stringify(projection)

    expect(projection.selected).toHaveLength(1)
    expect(projection.dropped).toHaveLength(0)
    expect(projection.pinned).toHaveLength(1)
    expect(serialized).toContain("public-resource")
    expect(serialized).not.toContain("private-resource")
    expect(serialized).not.toContain("private-contributor")
    expect(serialized).not.toContain("withheld")
    expect(serialized).not.toContain("dropReason")
  })

  it("recognizes the retained event envelope", () => {
    const event = {
      type: AGENT_CONTEXT_COMPILE_RECEIPT_EVENT,
      data: {
        applicationThreadId: "thread-1",
        principalId: "principal-1",
        personaId: "persona-1",
        receipt: projectAgentContextReceiptForRole(
          fixtureReceipt(),
          "assistant",
        ),
        turnId: "turn-1",
      },
      meta: { at: "2026-07-29T14:30:00.000Z" },
    }

    expect(isAgentContextCompileReceiptEvent(event)).toBe(true)
  })
})

function fixtureReceipt(): AgentContextCompileReceipt {
  return {
    audience: "model",
    compiledAt: "2026-07-29T14:30:00.000Z",
    compiler: {
      configVersion: "test",
      version: "0.1.1",
    },
    id: "receipt-1",
    maxTokens: 12000,
    pinned: [
      {
        activationReason: "pinned",
        pinned: true,
        provenance: {
          contributorId: "public-contributor",
          resourceKey: "public-resource",
        },
        tokenEstimate: { renderedTokens: 5, quality: "exact" },
        visibility: {
          decision: "visible",
          reason: "role",
          roleIds: ["assistant"],
        },
      },
      {
        activationReason: "pinned",
        pinned: true,
        provenance: {
          contributorId: "private-contributor",
          resourceKey: "private-resource",
        },
        tokenEstimate: { renderedTokens: 8, quality: "exact" },
        visibility: {
          decision: "withheld",
          reason: "role",
          roleIds: ["other"],
        },
      },
    ],
    requestId: "request-1",
    selected: [
      {
        activationReason: "query-match",
        kind: "selected",
        pinned: false,
        provenance: {
          contributorId: "public-contributor",
          resourceKey: "public-resource",
          revision: "r1",
        },
        tokenEstimate: {
          contentTokens: 4,
          renderedTokens: 5,
          quality: "exact",
        },
        visibility: {
          decision: "visible",
          reason: "role",
          roleIds: ["assistant"],
        },
      },
      {
        activationReason: "query-match",
        kind: "selected",
        pinned: false,
        provenance: {
          contributorId: "private-contributor",
          resourceKey: "private-resource",
          revision: "r1",
        },
        tokenEstimate: {
          contentTokens: 7,
          renderedTokens: 8,
          quality: "exact",
        },
        visibility: {
          decision: "withheld",
          reason: "role",
          roleIds: ["other"],
        },
      },
    ],
    dropped: [
      {
        activationReason: "budget",
        dropReason: "budget",
        kind: "dropped",
        pinned: false,
        provenance: {
          contributorId: "private-contributor",
          resourceKey: "private-resource",
        },
        tokenEstimate: { estimatedTokens: 90, quality: "fallback" },
        visibility: {
          decision: "withheld",
          reason: "role",
          roleIds: ["other"],
        },
      },
    ],
    status: "ready",
    totalTokens: 5,
    version: AGENT_CONTEXT_COMPILE_RECEIPT_VERSION,
  }
}
