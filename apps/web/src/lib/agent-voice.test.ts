import { describe, expect, it, vi } from "vitest"

import type { AgentMessagePart } from "@zigil/agent-surface"

import { speakMessageParts, synthesizeSpeech } from "./agent-voice"

const audioBytes = () =>
  new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }))

describe("synthesizeSpeech", () => {
  it("returns the synthesized audio", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioBytes())

    const audio = await synthesizeSpeech("hello", fetchImpl)

    expect(audio).toBeInstanceOf(Blob)
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/voice/speech",
      expect.objectContaining({ method: "POST" }),
    )
    expect(
      JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({ text: "hello" })
  })

  it("projects the bound persona without exposing voice settings to the client", async () => {
    let init: RequestInit | undefined
    const fetchImpl = async (_input: string, next: RequestInit) => {
      init = next
      return new Response(new Blob(["audio"], { type: "audio/mpeg" }))
    }

    await synthesizeSpeech("hello", fetchImpl, "persona-a")

    expect((init?.headers as Record<string, string>)["x-sigil-persona-id"]).toBe(
      "persona-a",
    )
    expect(init?.body).toBe(JSON.stringify({ text: "hello" }))
  })

  // Every failure mode is silence, never an exception.
  it.each([
    ["a network failure", vi.fn().mockRejectedValue(new Error("offline"))],
    [
      "an error status",
      vi.fn().mockResolvedValue(new Response(null, { status: 502 })),
    ],
    ["empty audio", vi.fn().mockResolvedValue(new Response(new Blob()))],
  ])("degrades %s to undefined without throwing", async (_label, fetchImpl) => {
    await expect(synthesizeSpeech("hello", fetchImpl)).resolves.toBeUndefined()
  })
})

describe("speakMessageParts", () => {
  const textPart: AgentMessagePart = { type: "text", text: "Here you go." }

  it("speaks the projected text of a message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioBytes())

    const outcome = await speakMessageParts([textPart], {}, fetchImpl)

    expect(outcome.status).toBe("spoken")
    expect(
      JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({ text: "Here you go." })
  })

  it("never requests synthesis when nothing is speakable", async () => {
    const fetchImpl = vi.fn()
    const reasoning: AgentMessagePart = { type: "reasoning", text: "hmm" }

    const outcome = await speakMessageParts([reasoning], {}, fetchImpl)

    expect(outcome.status).toBe("nothing-to-say")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  // US-002's degrade-to-text criterion: a TTS failure must leave the chat
  // surface untouched. Rendering never depends on this call, so the whole
  // contract is that it resolves — to a status, never a rejection.
  it("degrades a synth failure to a status the caller can ignore", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("synth down"))

    await expect(
      speakMessageParts([textPart], {}, fetchImpl),
    ).resolves.toEqual({ status: "failed" })
  })
})
