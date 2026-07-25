import { afterEach, describe, expect, it, vi } from "vitest"

import {
  SPEECH_MEDIA_TYPES,
  synthesizeThroughVoiceProvider,
} from "./speech-provider.js"

const ENV = {
  SIGIL_VOICE_TTS_BASE_URL: "http://tts.internal:8880/v1",
  SIGIL_VOICE_TTS_API_KEY: "sk-provider-secret",
  SIGIL_VOICE_TTS_VOICE: "af_heart",
  SIGIL_VOICE_TTS_MODEL: "kokoro",
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    text: "Say the quiet part.",
    signal: new AbortController().signal,
    env: ENV,
    ...overrides,
  } as Parameters<typeof synthesizeThroughVoiceProvider>[0]
}

function stubFetch(
  respond: (url: string, init: RequestInit) => Response,
): { calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return Promise.resolve(respond(String(url), init))
  })
  return { calls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("synthesizeThroughVoiceProvider", () => {
  it("posts the resolved provider contract with the caller's delivery parameters", async () => {
    const { calls } = stubFetch(
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "audio/wav" },
        }),
    )

    const result = await synthesizeThroughVoiceProvider(
      request({ voice: "am_michael", format: "wav", speed: 1.25 }),
    )

    expect(calls[0]?.url).toBe("http://tts.internal:8880/v1/audio/speech")
    expect(
      (calls[0]?.init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer sk-provider-secret")
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      model: "kokoro",
      voice: "am_michael",
      input: "Say the quiet part.",
      response_format: "wav",
      speed: 1.25,
    })
    expect(result).toMatchObject({
      mediaType: "audio/wav",
      voice: "am_michael",
      format: "wav",
      model: "kokoro",
    })
    expect(Array.from(result.bytes)).toEqual([1, 2, 3])
  })

  it("uses the deployment's default voice and format, and the format's media type when the provider sends none", async () => {
    stubFetch(() => new Response(new Uint8Array([9])))

    const result = await synthesizeThroughVoiceProvider(request())

    expect(result.voice).toBe("af_heart")
    expect(result.format).toBe("mp3")
    expect(result.mediaType).toBe(SPEECH_MEDIA_TYPES.mp3)
  })

  it("keeps personas distinct while an explicit per-call voice wins", async () => {
    const { calls } = stubFetch(
      () => new Response(new Uint8Array([4]), { headers: { "content-type": "audio/mpeg" } }),
    )

    const first = await synthesizeThroughVoiceProvider(
      request({ personaVoice: { voice: "persona-a", speed: 0.9 } }),
    )
    const second = await synthesizeThroughVoiceProvider(
      request({ personaVoice: { voice: "persona-b" } }),
    )
    const overridden = await synthesizeThroughVoiceProvider(
      request({
        voice: "call-voice",
        personaVoice: { voice: "persona-b", speed: 1.1 },
      }),
    )

    expect([first.voice, second.voice, overridden.voice]).toEqual([
      "persona-a",
      "persona-b",
      "call-voice",
    ])
    expect(
      calls.map(({ init }) => JSON.parse(String(init.body)).voice),
    ).toEqual(["persona-a", "persona-b", "call-voice"])
  })

  it("returns converter output and degrades converter failure to original TTS audio", async () => {
    stubFetch(
      () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } }),
    )
    const conversion = {
      enabled: true as const,
      baseURL: "https://converter.secret/v1",
      model: "rvc-a",
      voice: "target-a",
      format: "wav" as const,
      apiKey: "conversion-secret",
    }
    const converter = vi.fn(async ({ bytes }: { bytes: Uint8Array }) => {
      expect(Array.from(bytes)).toEqual([1, 2, 3])
      return { bytes: new Uint8Array([9, 8]), mediaType: "audio/wav" }
    })

    const converted = await synthesizeThroughVoiceProvider(
      request({ personaVoice: { voice: "persona-a", conversion }, converter }),
    )
    expect(Array.from(converted.bytes)).toEqual([9, 8])
    expect(converted.mediaType).toBe("audio/wav")

    const degraded = await synthesizeThroughVoiceProvider(
      request({
        personaVoice: { voice: "persona-a", conversion },
        converter: async () => {
          throw new Error(
            "https://converter.secret/v1 credential=conversion-secret",
          )
        },
      }),
    )
    expect(Array.from(degraded.bytes)).toEqual([1, 2, 3])
    expect(JSON.stringify(degraded)).not.toMatch(
      /converter\.secret|conversion-secret/,
    )
  })

  it("reports an upstream rejection by status alone", async () => {
    stubFetch(
      () =>
        new Response("upstream said: POST http://tts.internal:8880/v1 key=sk-provider-secret", {
          status: 401,
        }),
    )

    await expect(synthesizeThroughVoiceProvider(request())).rejects.toThrow(
      /rejected the request \(HTTP 401\)/,
    )
    // The upstream body is never forwarded, so neither is anything it echoed.
    await expect(
      synthesizeThroughVoiceProvider(request()).catch((error: Error) =>
        Promise.reject(error.message),
      ),
    ).rejects.not.toMatch(/tts\.internal|sk-provider-secret/)
  })

  it("treats an empty response as a failure rather than an empty artifact", async () => {
    stubFetch(() => new Response(new Uint8Array()))

    await expect(synthesizeThroughVoiceProvider(request())).rejects.toThrow(
      /returned no audio/,
    )
  })

  it("refuses an unconfigurable voice environment without quoting the configuration", async () => {
    await expect(
      synthesizeThroughVoiceProvider(
        request({ env: { SIGIL_VOICE_TTS_BASE_URL: "not-a-url://%%%" } }),
      ),
    ).rejects.toThrow(/not configured correctly/)

    await expect(
      synthesizeThroughVoiceProvider(
        request({ env: { SIGIL_VOICE_TTS_BASE_URL: "not-a-url://%%%" } }),
      ).catch((error: Error) => Promise.reject(error.message)),
    ).rejects.not.toMatch(/not-a-url/)
  })
})
