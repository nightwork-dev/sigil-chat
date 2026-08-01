import { describe, expect, it } from "vitest"

import type { AgentMessage } from "@zigil/agent/contracts"

import { completedAgentReplies, repliesToSpeak } from "./reply-speech"

function message(
  id: string,
  role: AgentMessage["role"],
  text: string,
): AgentMessage {
  return { id, role, parts: [{ type: "text", text }] }
}

const TURN: readonly AgentMessage[] = [
  message("m1", "user", "what changed?"),
  message("m2", "assistant", "Three files."),
  message("m3", "user", "and the tests?"),
  message("m4", "assistant", "All passing."),
]

describe("no partial narration", () => {
  it("excludes the message still being streamed", () => {
    const spoken = completedAgentReplies({ messages: TURN, isStreaming: true })
    expect(spoken.map((m) => m.id)).toEqual(["m2"])
  })

  it("includes it once the turn completes", () => {
    const spoken = completedAgentReplies({ messages: TURN, isStreaming: false })
    expect(spoken.map((m) => m.id)).toEqual(["m2", "m4"])
  })

  // The streaming message is excluded because the SESSION says it is in
  // flight, never because of how finished its text happens to look.
  it("excludes a streaming reply that already reads as a complete sentence", () => {
    const messages = [message("m1", "assistant", "Done — 3 files changed.")]
    expect(completedAgentReplies({ messages, isStreaming: true })).toHaveLength(
      0,
    )
  })
})

describe("what is a reply", () => {
  it("never speaks the user's own words back to them", () => {
    const spoken = completedAgentReplies({ messages: TURN, isStreaming: false })
    expect(spoken.every((m) => m.role === "assistant")).toBe(true)
  })

  it("ignores system messages", () => {
    const messages = [message("s1", "system", "context refreshed")]
    expect(
      completedAgentReplies({ messages, isStreaming: false }),
    ).toHaveLength(0)
  })
})

describe("speaking each reply once", () => {
  it("skips replies already spoken", () => {
    const pending = repliesToSpeak({
      messages: TURN,
      isStreaming: false,
      spokenIds: new Set(["m2"]),
    })
    expect(pending.map((m) => m.id)).toEqual(["m4"])
  })

  it("returns both when two turns landed together, oldest first", () => {
    const pending = repliesToSpeak({
      messages: TURN,
      isStreaming: false,
      spokenIds: new Set(),
    })
    expect(pending.map((m) => m.id)).toEqual(["m2", "m4"])
  })

  it("returns nothing when everything has been spoken", () => {
    expect(
      repliesToSpeak({
        messages: TURN,
        isStreaming: false,
        spokenIds: new Set(["m2", "m4"]),
      }),
    ).toHaveLength(0)
  })
})
