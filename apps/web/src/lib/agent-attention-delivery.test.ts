import { beforeEach, describe, expect, it } from "vitest"
import type { AttentionContext } from "@niwork/agent/attention"

import {
  commitAttentionDelivery,
  pendingAttentionContext,
  resetAttentionDeliveryForTests,
} from "./agent-attention-delivery"

beforeEach(resetAttentionDeliveryForTests)

describe("agent attention delivery", () => {
  it("tracks delivered activity independently for each agent thread", () => {
    const context = attention([activity(100), activity(200)])
    commitAttentionDelivery(context, "thread-a")

    expect(
      pendingAttentionContext(context, "thread-a")?.history,
    ).toBeUndefined()
    expect(pendingAttentionContext(context, "thread-b")?.history).toEqual(
      context.history,
    )
  })

  it("keeps current selections while filtering previously delivered activity", () => {
    const first = attention([activity(100)])
    commitAttentionDelivery(first, "thread-a")
    const current = attention([activity(100), activity(200)])

    expect(pendingAttentionContext(current, "thread-a")).toMatchObject({
      selection: { id: "passage-b" },
      selections: [{ id: "passage-b" }],
      history: [{ timestamp: 200 }],
    })
  })
})

function attention(history: AttentionContext["history"]): AttentionContext {
  const selection = { kind: "passage", id: "passage-b", label: "Passage B" }
  return {
    application: "sigil-chat",
    route: "/review",
    selection,
    selections: [selection],
    history,
  }
}

function activity(timestamp: number) {
  return {
    action: "edit",
    target: { kind: "passage", id: `passage-${timestamp}` },
    timestamp,
  } as const
}
