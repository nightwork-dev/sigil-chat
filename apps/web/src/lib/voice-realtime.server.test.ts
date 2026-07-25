import { describe, expect, it, vi } from "vitest"

import {
  exchangeRealtimeOffer,
  REALTIME_OFFER_PATH,
  REALTIME_STOP_PATH,
  requestRealtimeStop,
  type RealtimeRelayDependencies,
} from "./voice-realtime.server"

const OFFER = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
const ANSWER = "v=0\r\na=ice-lite\r\n"

function dependencies(
  respond: (request: Request) => Response | Promise<Response>,
): RealtimeRelayDependencies & { calls: Request[] } {
  const calls: Request[] = []
  return {
    calls,
    eveOrigin: "http://agent.test",
    getEveToken: () => Promise.resolve("service-token"),
    fetcher: (async (input, init) => {
      const request = new Request(input as string, init)
      calls.push(request)
      return respond(request)
    }) as typeof fetch,
  }
}

describe("relaying the offer to Eve", () => {
  it("posts the offer to the Eve seam with the service token and returns the answer", async () => {
    const deps = dependencies(() =>
      Response.json({ threadId: "thread-9", answerSdp: ANSWER }),
    )

    const result = await exchangeRealtimeOffer(OFFER, deps)

    expect(result).toEqual({ threadId: "thread-9", answerSdp: ANSWER })
    const request = deps.calls[0]!
    expect(new URL(request.url).pathname).toBe(REALTIME_OFFER_PATH)
    expect(request.method).toBe("POST")
    // The bearer is minted here, on the server — the browser never holds it.
    expect(request.headers.get("authorization")).toBe("Bearer service-token")
    await expect(request.json()).resolves.toEqual({ offerSdp: OFFER })
  })

  it("passes Eve's refusal message through instead of a bare status", async () => {
    const deps = dependencies(() =>
      Response.json(
        { error: "thread/realtime/start failed: Voice session access denied" },
        { status: 502 },
      ),
    )

    await expect(exchangeRealtimeOffer(OFFER, deps)).resolves.toEqual({
      error: "thread/realtime/start failed: Voice session access denied",
    })
  })

  it("degrades to an error result when Eve is unreachable", async () => {
    const deps = dependencies(() => {
      throw new Error("ECONNREFUSED")
    })

    const result = await exchangeRealtimeOffer(OFFER, deps)

    expect(result).toMatchObject({ error: expect.stringMatching(/unavailable/i) })
  })

  it("treats a malformed answer as an error rather than a live session", async () => {
    const deps = dependencies(() => Response.json({ threadId: "thread-9" }))

    await expect(exchangeRealtimeOffer(OFFER, deps)).resolves.toMatchObject({
      error: expect.stringMatching(/unusable/i),
    })
  })

  it("does not spend a request on an empty offer", async () => {
    const deps = dependencies(() => Response.json({}))

    await expect(exchangeRealtimeOffer("   ", deps)).resolves.toMatchObject({
      error: expect.any(String),
    })
    expect(deps.calls).toHaveLength(0)
  })
})

describe("ending the session", () => {
  it("posts to the stop path and reports what the host said", async () => {
    const deps = dependencies(() => Response.json({ stopped: true }))

    await expect(requestRealtimeStop(deps)).resolves.toBe(true)
    expect(new URL(deps.calls[0]!.url).pathname).toBe(REALTIME_STOP_PATH)
    expect(deps.calls[0]!.headers.get("authorization")).toBe(
      "Bearer service-token",
    )
  })

  it("never throws when teardown fails — the browser has already hung up", async () => {
    const failing = dependencies(() => {
      throw new Error("ECONNREFUSED")
    })
    const refusing = dependencies(() => new Response(null, { status: 500 }))

    await expect(requestRealtimeStop(failing)).resolves.toBe(false)
    await expect(requestRealtimeStop(refusing)).resolves.toBe(false)
  })

  it("reports false when the host says nothing was stopped", async () => {
    const deps = dependencies(() => Response.json({ stopped: false }))
    const token = vi.fn(() => Promise.resolve("service-token"))

    await expect(
      requestRealtimeStop({ ...deps, getEveToken: token }),
    ).resolves.toBe(false)
    expect(token).toHaveBeenCalledTimes(1)
  })
})
