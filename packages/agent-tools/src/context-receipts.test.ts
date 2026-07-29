import { describe, expect, it } from "vitest"

import {
  MemoryAgentContextReceiptRepository,
  type AgentContextReceiptRecord,
} from "./context-receipts"
import {
  AGENT_CONTEXT_COMPILE_RECEIPT_VERSION,
  type AgentContextCompileReceipt,
} from "@workspace/agent-contracts/context-receipt"

describe("agent context receipt repository", () => {
  it("returns role-scoped projections without leaking withheld entries", () => {
    const repo = new MemoryAgentContextReceiptRepository(
      () => "2026-07-29T15:00:00.000Z",
    )
    repo.append({
      applicationThreadId: "thread-1",
      principalId: "user-1",
      receipt: receipt(),
    })

    const [visible] = repo.list("thread-1", ["assistant"])
    const serialized = JSON.stringify(visible)

    expect(visible?.receipt.selected).toHaveLength(1)
    expect(serialized).toContain("public-resource")
    expect(serialized).not.toContain("private-resource")
    expect(serialized).not.toContain("withheld")
  })
})

function receipt(): AgentContextCompileReceipt {
  return {
    audience: "model",
    compiledAt: "2026-07-29T14:59:00.000Z",
    compiler: { configVersion: "test", version: "0.1.1" },
    id: "receipt-1",
    maxTokens: 12000,
    pinned: [],
    requestId: "request-1",
    selected: [
      item("public-resource", "visible"),
      item("private-resource", "withheld"),
    ],
    dropped: [],
    status: "ready",
    totalTokens: 10,
    version: AGENT_CONTEXT_COMPILE_RECEIPT_VERSION,
  }
}

function item(
  resourceKey: string,
  decision: "visible" | "withheld",
): AgentContextReceiptRecord["receipt"]["selected"][number] {
  return {
    activationReason: "selected",
    kind: "selected",
    pinned: false,
    provenance: { contributorId: "test", resourceKey },
    tokenEstimate: { renderedTokens: 5, quality: "fallback" },
    visibility: { decision, reason: "test", roleIds: ["assistant"] },
  }
}
