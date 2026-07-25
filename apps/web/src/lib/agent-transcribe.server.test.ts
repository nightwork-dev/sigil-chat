import { beforeEach, describe, expect, it, vi } from "vitest"

import { readVoiceEnvironment } from "@workspace/runtime-env/voice"

import {
  MAX_AUDIO_BYTES,
  transcribeAudioFromRequest,
} from "./agent-transcribe.server"

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}))

vi.mock("./auth/session", () => ({
  getSession: mocks.getSession,
  requireSession: (session: unknown) => {
    if (!session)
      throw Object.assign(new Error("Authentication required"), {
        status: 401,
      })
  },
}))

/** The provider the handler must call — derived from the same resolver the
 *  handler uses, so a change to profile defaults updates expectations too. */
const expectedProvider = readVoiceEnvironment({}).stt

const upstreamFetch = vi.fn()
vi.stubGlobal("fetch", upstreamFetch)

function transcribeRequest(audio?: Blob, fieldName = "audio"): Request {
  const form = new FormData()
  if (audio) form.set(fieldName, audio, "dictation.webm")
  return new Request("http://sigil.test/api/voice/transcribe", {
    method: "POST",
    body: form,
  })
}

describe("transcribeAudioFromRequest", () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.getSession.mockResolvedValue({ user: { id: "member-1" } })
    upstreamFetch.mockReset()
    upstreamFetch.mockResolvedValue(
      new Response(JSON.stringify({ text: "remind me to call mom" }), {
        headers: { "Content-Type": "application/json" },
      }),
    )
  })

  it("rejects anonymous transcription without touching the provider", async () => {
    mocks.getSession.mockResolvedValue(null)

    const response = await transcribeAudioFromRequest(
      transcribeRequest(new Blob(["fake audio"], { type: "audio/webm" })),
    )

    expect(response.status).toBe(401)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it("speaks the Gonk voice-stt contract at the resolved provider", async () => {
    const response = await transcribeAudioFromRequest(
      transcribeRequest(new Blob(["fake audio"], { type: "audio/webm" })),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ text: "remind me to call mom" })

    const [url, init] = upstreamFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${expectedProvider.baseURL}/audio/transcriptions`)

    const sentForm = init.body as FormData
    expect(sentForm.get("model")).toBe(expectedProvider.model)
    const sentFile = sentForm.get("file")
    expect(sentFile).toBeInstanceOf(File)
  })

  it("keeps the transcript out of shared caches", async () => {
    const response = await transcribeAudioFromRequest(
      transcribeRequest(new Blob(["fake audio"], { type: "audio/webm" })),
    )
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  })

  it("forwards the provider credential only when one is configured", async () => {
    await transcribeAudioFromRequest(
      transcribeRequest(new Blob(["fake audio"])),
    )
    let [, init] = upstreamFetch.mock.calls[0] as [string, RequestInit]
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined()

    upstreamFetch.mockClear()
    await transcribeAudioFromRequest(
      transcribeRequest(new Blob(["fake audio"])),
      { SIGIL_VOICE_STT_API_KEY: "sk-test" },
    )
    ;[, init] = upstreamFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test",
    )
  })

  it("rejects a request with no audio field without calling the provider", async () => {
    const response = await transcribeAudioFromRequest(transcribeRequest())
    expect(response.status).toBe(400)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it("rejects an empty audio blob without calling the provider", async () => {
    const response = await transcribeAudioFromRequest(
      transcribeRequest(new Blob([])),
    )
    expect(response.status).toBe(400)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it("bounds capture size instead of relaying arbitrary uploads", async () => {
    const oversized = new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)])
    const response = await transcribeAudioFromRequest(
      transcribeRequest(oversized),
    )
    expect(response.status).toBe(413)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  // The degrade contract: failures become statuses, never throws.
  it("maps an upstream error status to 502, not an exception", async () => {
    upstreamFetch.mockResolvedValue(new Response(null, { status: 500 }))
    const response = await transcribeAudioFromRequest(
      transcribeRequest(new Blob(["fake audio"])),
    )
    expect(response.status).toBe(502)
  })

  it("maps an unreachable provider to 502, not an exception", async () => {
    upstreamFetch.mockRejectedValue(new Error("ECONNREFUSED"))
    const response = await transcribeAudioFromRequest(
      transcribeRequest(new Blob(["fake audio"])),
    )
    expect(response.status).toBe(502)
  })

  it("maps a misconfigured voice environment to 500, not an exception", async () => {
    const response = await transcribeAudioFromRequest(
      transcribeRequest(new Blob(["fake audio"])),
      { SIGIL_VOICE_PROFILE: "gpu-box" },
    )
    expect(response.status).toBe(500)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })
})
