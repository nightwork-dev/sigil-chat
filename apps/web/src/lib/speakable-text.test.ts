import { describe, expect, it } from "vitest"

import type { AgentMessagePart } from "@zigil/agent-surface"

import { announceAuthorization, speakableText } from "./speakable-text"

/** One sample of every part kind the agent surface can produce, each carrying
 *  a marker that must never be spoken. Driving the leak tests from this table
 *  means a NEW part type added upstream gets covered by adding one row, not by
 *  remembering to write another test. */
const SECRET = "LEAKCANARY"

const NON_SPEAKABLE_PARTS: ReadonlyArray<{
  readonly label: string
  readonly part: AgentMessagePart
}> = [
  {
    label: "reasoning trace",
    part: { type: "reasoning", text: `thinking about ${SECRET}` },
  },
  {
    label: "tool arguments",
    part: {
      type: "tool-call",
      id: "t1",
      name: "read_file",
      state: "input-available",
      input: { path: `/etc/${SECRET}` },
    },
  },
  {
    label: "tool results",
    part: {
      type: "tool-call",
      id: "t2",
      name: "read_file",
      state: "output-available",
      output: { contents: SECRET },
    },
  },
  {
    label: "tool error text",
    part: {
      type: "tool-call",
      id: "t3",
      name: "read_file",
      state: "output-error",
      errorText: `failed on ${SECRET}`,
    },
  },
  {
    label: "authorization receipt",
    part: {
      type: "authorization",
      id: "a1",
      state: "completed",
      displayName: "GitHub",
      description: `token ${SECRET}`,
      outcome: "authorized",
      authorizationUrl: `https://example.com/${SECRET}`,
    },
  },
  {
    label: "file part",
    part: { type: "file", mediaType: "text/plain", url: `https://x/${SECRET}` },
  },
]

describe("speakableText", () => {
  it("speaks assistant text", () => {
    expect(speakableText([{ type: "text", text: "Done — 3 files changed." }])).toBe(
      "Done — 3 files changed.",
    )
  })

  it.each(NON_SPEAKABLE_PARTS)("never speaks $label", ({ part }) => {
    const spoken = speakableText([part], { announceApprovals: true }) ?? ""
    expect(spoken).not.toContain(SECRET)
  })

  it("speaks nothing but the text when parts are interleaved", () => {
    const parts: AgentMessagePart[] = [
      ...NON_SPEAKABLE_PARTS.map((entry) => entry.part),
      { type: "text", text: "Here is the answer." },
    ]
    expect(speakableText(parts)).toBe("Here is the answer.")
  })

  it("returns undefined when nothing is speakable, so no synth request is made", () => {
    const parts = NON_SPEAKABLE_PARTS.map((entry) => entry.part)
    expect(speakableText(parts)).toBeUndefined()
    expect(speakableText([])).toBeUndefined()
    expect(speakableText([{ type: "text", text: "   " }])).toBeUndefined()
  })

  // Fails closed: the part union lives in @zigil/agent-surface and will gain
  // members without us. An unknown part must be silence, not a leak.
  it("does not speak an unrecognized future part type", () => {
    const future = { type: "telemetry", text: SECRET } as unknown as AgentMessagePart
    expect(speakableText([future]) ?? "").not.toContain(SECRET)
  })

  it("joins multiple text parts into one utterance", () => {
    expect(
      speakableText([
        { type: "text", text: "First." },
        { type: "text", text: "Second." },
      ]),
    ).toBe("First. Second.")
  })
})

describe("approval announcements", () => {
  const pending: AgentMessagePart = {
    type: "authorization",
    id: "a2",
    state: "required",
    displayName: "Image generation",
    description: `uses ${SECRET}`,
  }

  it("announces that approval is needed without leaking its detail", () => {
    const spoken = speakableText([pending], { announceApprovals: true }) ?? ""
    expect(spoken).toContain("Image generation")
    expect(spoken).toContain("needs your approval")
    expect(spoken).not.toContain(SECRET)
  })

  it("stays silent about approvals unless asked to announce", () => {
    expect(speakableText([pending])).toBeUndefined()
  })

  // displayName is provider-supplied and the one string crossing into
  // speech — it must stay a name, not a monologue.
  it("bounds an oversized display name instead of speaking it whole", () => {
    const spoken =
      speakableText(
        [{ ...pending, displayName: "A".repeat(500) }],
        { announceApprovals: true },
      ) ?? ""
    expect(spoken.length).toBeLessThan(120)
    expect(spoken).toContain("needs your approval")
  })

  // The announcement is not a grant. Nothing spoken may be actionable as
  // authority — no URL, no receipt, no confirmation token.
  it("never speaks an authorization URL or outcome", () => {
    const completed = {
      ...pending,
      state: "completed" as const,
      outcome: "authorized" as const,
      authorizationUrl: "https://example.com/grant",
    }
    const spoken = speakableText([completed], { announceApprovals: true }) ?? ""
    expect(spoken).not.toContain("https://")
    expect(spoken).not.toContain("authorized")
    expect(announceAuthorization(completed)).toBeUndefined()
  })
})
