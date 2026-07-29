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
    expect(visible?.receipt.totalTokens).toBe(5)
    expect(serialized).toContain("public-resource")
    expect(serialized).not.toContain("private-resource")
    expect(serialized).not.toContain("withheld")
  })

  it("drops hidden-only records without leaking count timing actor or size", () => {
    const repo = new MemoryAgentContextReceiptRepository(
      () => "2026-07-29T15:00:00.000Z",
    )
    repo.append({
      applicationThreadId: "thread-hidden",
      principalId: "private-actor",
      personaId: "private-persona",
      receipt: hiddenReceipt(),
    })

    const records = repo.list("thread-hidden", ["assistant"])
    const serialized = JSON.stringify(records)

    expect(records).toEqual([])
    expect(serialized).not.toContain("private-actor")
    expect(serialized).not.toContain("private-persona")
    expect(serialized).not.toContain("private-resource")
    expect(serialized).not.toContain("2026-07-29T14:59:00.000Z")
    expect(serialized).not.toContain("37")
  })

  it("purges receipts for deleted threads", () => {
    const repo = new MemoryAgentContextReceiptRepository(
      () => "2026-07-29T15:00:00.000Z",
    )
    repo.append({
      applicationThreadId: "thread-delete",
      principalId: "user-1",
      receipt: receipt(),
    })

    expect(repo.list("thread-delete", ["assistant"])).toHaveLength(1)

    repo.purge("thread-delete")

    expect(repo.list("thread-delete", ["assistant"])).toEqual([])
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

function hiddenReceipt(): AgentContextCompileReceipt {
  return {
    ...receipt(),
    id: "receipt-hidden",
    requestId: "request-hidden",
    selected: [item("private-resource", "withheld")],
    totalTokens: 37,
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
