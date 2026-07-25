import { describe, expect, it } from "vitest"

import { dictationOutcome } from "./dictation-outcome"

describe("dictationOutcome", () => {
  it("defaults a transcription to an editable draft", () => {
    expect(dictationOutcome("remind me to call mom")).toEqual({
      kind: "draft",
      text: "remind me to call mom",
    })
  })

  it("stays a draft when voiceFirst is explicitly false", () => {
    expect(
      dictationOutcome("remind me to call mom", { voiceFirst: false }),
    ).toEqual({ kind: "draft", text: "remind me to call mom" })
  })

  // The never-auto-send guard: only an explicit `voiceFirst: true` sends.
  it("sends only when voiceFirst is explicitly true", () => {
    expect(
      dictationOutcome("remind me to call mom", { voiceFirst: true }),
    ).toEqual({ kind: "send", text: "remind me to call mom" })
  })

  it.each([
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace only", "   \n\t"],
  ])("yields a no-op for %s transcription", (_label, transcription) => {
    expect(dictationOutcome(transcription)).toEqual({ kind: "noop" })
  })

  it("yields a no-op for whitespace transcription even with voiceFirst true", () => {
    expect(dictationOutcome("   ", { voiceFirst: true })).toEqual({
      kind: "noop",
    })
  })
})
