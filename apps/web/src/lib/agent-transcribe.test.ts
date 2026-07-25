import { describe, expect, it, vi } from "vitest"

import { transcribeAudio } from "./agent-transcribe"

const audioResponse = (text: string) =>
  new Response(JSON.stringify({ text }), {
    headers: { "Content-Type": "application/json" },
  })

describe("transcribeAudio", () => {
  it("returns the transcribed text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse("hello there"))
    const audio = new Blob(["fake audio"], { type: "audio/webm" })

    const text = await transcribeAudio(audio, fetchImpl)

    expect(text).toBe("hello there")
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/voice/transcribe",
      expect.objectContaining({ method: "POST" }),
    )
    const sentForm = (fetchImpl.mock.calls[0]![1] as RequestInit)
      .body as FormData
    expect(sentForm.get("audio")).toBeInstanceOf(Blob)
  })

  // Every failure mode is "no transcript", never an exception.
  it.each([
    ["a network failure", vi.fn().mockRejectedValue(new Error("offline"))],
    [
      "an error status",
      vi.fn().mockResolvedValue(new Response(null, { status: 502 })),
    ],
    ["blank text", vi.fn().mockResolvedValue(audioResponse("   "))],
    [
      "a malformed response",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}))),
    ],
  ])("degrades %s to undefined without throwing", async (_label, fetchImpl) => {
    await expect(
      transcribeAudio(new Blob(["fake audio"]), fetchImpl),
    ).resolves.toBeUndefined()
  })
})
