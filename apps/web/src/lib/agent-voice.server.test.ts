import { beforeEach, describe, expect, it, vi } from "vitest"

import { readVoiceEnvironment } from "@workspace/runtime-env/voice"

import {
  MAX_SPEAKABLE_LENGTH,
  synthesizeSpeechFromRequest,
} from "./agent-voice.server"

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
const expectedProvider = readVoiceEnvironment({}).tts

const upstreamFetch = vi.fn()
vi.stubGlobal("fetch", upstreamFetch)

function speechRequest(body: unknown): Request {
  return new Request("http://sigil.test/api/voice/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function personaSpeechRequest(body: unknown, personaId: string): Request {
  const request = speechRequest(body)
  request.headers.set("x-sigil-persona-id", personaId)
  return request
}

describe("synthesizeSpeechFromRequest", () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.getSession.mockResolvedValue({ user: { id: "member-1" } })
    upstreamFetch.mockReset()
    upstreamFetch.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "audio/mpeg" },
      }),
    )
  })

  it("rejects anonymous synthesis without touching the provider", async () => {
    mocks.getSession.mockResolvedValue(null)

    const response = await synthesizeSpeechFromRequest(
      speechRequest({ text: "hello" }),
    )

    expect(response.status).toBe(401)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it("speaks the Gonk voice-tts contract at the resolved provider", async () => {
    const response = await synthesizeSpeechFromRequest(
      speechRequest({ text: "Done — 3 files changed." }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    )

    const [url, init] = upstreamFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${expectedProvider.baseURL}/audio/speech`)
    expect(JSON.parse(init.body as string)).toEqual({
      model: expectedProvider.model,
      voice: expectedProvider.voice,
      input: "Done — 3 files changed.",
      response_format: expectedProvider.format,
    })
  })

  it("keeps the audio out of shared caches", async () => {
    const response = await synthesizeSpeechFromRequest(
      speechRequest({ text: "hello" }),
    )
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  })

  it("uses persona voice defaults and returns converted audio", async () => {
    const converter = vi.fn(async ({ bytes }: { bytes: Uint8Array }) => {
      expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
      return { bytes: new Uint8Array([7, 8]), mediaType: "audio/wav" }
    })
    const response = await synthesizeSpeechFromRequest(
      personaSpeechRequest({ text: "hello" }, "persona-a"),
      {},
      {
        converter,
        personaVoice: (personaId) => ({
          voice: personaId === "persona-a" ? "voice-a" : "voice-b",
          speed: 1.25,
          conversion: {
            enabled: true,
            baseURL: "https://converter.invalid/v1",
            model: "rvc-a",
            voice: "target-a",
            format: "wav",
            apiKey: "conversion-secret",
          },
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("audio/wav")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([7, 8]),
    )
    expect(converter).toHaveBeenCalledOnce()
    const [, init] = upstreamFetch.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({
      voice: "voice-a",
      speed: 1.25,
    })
  })

  it("degrades a conversion failure to the original TTS bytes without leaking configuration", async () => {
    const converter = vi.fn(async () => {
      throw new Error(
        "https://converter.secret/v1 credential=conversion-secret",
      )
    })
    const response = await synthesizeSpeechFromRequest(
      personaSpeechRequest({ text: "hello" }, "persona-a"),
      {},
      {
        converter,
        personaVoice: () => ({
          voice: "voice-a",
          conversion: {
            enabled: true,
            baseURL: "https://converter.secret/v1",
            model: "rvc-a",
            voice: "target-a",
            format: "wav",
            apiKey: "conversion-secret",
          },
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    )
    expect(JSON.stringify({ status: response.status })).not.toMatch(
      /converter\.secret|conversion-secret/,
    )
  })

  it("forwards the provider credential only when one is configured", async () => {
    await synthesizeSpeechFromRequest(speechRequest({ text: "hi" }))
    let [, init] = upstreamFetch.mock.calls[0] as [string, RequestInit]
    expect(
      (init.headers as Record<string, string>).Authorization,
    ).toBeUndefined()

    upstreamFetch.mockClear()
    await synthesizeSpeechFromRequest(speechRequest({ text: "hi" }), {
      SIGIL_VOICE_TTS_API_KEY: "sk-test",
    })
    ;[, init] = upstreamFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test",
    )
  })

  it.each([
    ["missing text", {}],
    ["blank text", { text: "   " }],
    ["non-string text", { text: 42 }],
  ])("rejects %s without calling the provider", async (_label, body) => {
    const response = await synthesizeSpeechFromRequest(speechRequest(body))
    expect(response.status).toBe(400)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it("bounds utterance length instead of relaying documents", async () => {
    const response = await synthesizeSpeechFromRequest(
      speechRequest({ text: "a".repeat(MAX_SPEAKABLE_LENGTH + 1) }),
    )
    expect(response.status).toBe(413)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  // The degrade-to-text contract: failures become statuses, never throws.
  it("maps an upstream error status to 502, not an exception", async () => {
    upstreamFetch.mockResolvedValue(new Response(null, { status: 500 }))
    const response = await synthesizeSpeechFromRequest(
      speechRequest({ text: "hello" }),
    )
    expect(response.status).toBe(502)
  })

  it("maps an unreachable provider to 502, not an exception", async () => {
    upstreamFetch.mockRejectedValue(new Error("ECONNREFUSED"))
    const response = await synthesizeSpeechFromRequest(
      speechRequest({ text: "hello" }),
    )
    expect(response.status).toBe(502)
  })

  it("maps a misconfigured voice environment to 500, not an exception", async () => {
    const response = await synthesizeSpeechFromRequest(
      speechRequest({ text: "hello" }),
      { SIGIL_VOICE_PROFILE: "gpu-box" },
    )
    expect(response.status).toBe(500)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })
})
