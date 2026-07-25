import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import { describe, expect, it, vi } from "vitest"

import { AGENT_SCOPE_HEADER } from "./agent-session-scope"
import {
  exchangeRealtimeOffer,
  REALTIME_OFFER_PATH,
  REALTIME_STOP_PATH,
  requestRealtimeStop,
  type RealtimeRelayDependencies,
  type RealtimeThreadProof,
} from "./voice-realtime.server"

const OFFER = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
const ANSWER = "v=0\r\na=ice-lite\r\n"
const THREAD = "thread-9"

const PROOF: RealtimeThreadProof = {
  resourceScope: `session:${THREAD}`,
  scopeProof: "scope-proof",
  sessionBindingProof: "binding-proof",
}

function dependencies(
  respond: (request: Request) => Response | Promise<Response>,
  proveThread: RealtimeRelayDependencies["proveThread"] = () =>
    Promise.resolve(PROOF),
): RealtimeRelayDependencies & { calls: Request[] } {
  const calls: Request[] = []
  return {
    calls,
    eveOrigin: "http://agent.test",
    getEveToken: () => Promise.resolve("service-token"),
    proveThread,
    fetcher: (async (input, init) => {
      const request = new Request(input as string, init)
      calls.push(request)
      return respond(request)
    }) as typeof fetch,
  }
}

const offer = (applicationThreadId = THREAD) => ({
  offerSdp: OFFER,
  applicationThreadId,
})

describe("relaying the offer to Eve", () => {
  it("carries the thread and the proofs that make it authoritative", async () => {
    const deps = dependencies(() =>
      Response.json({
        threadId: "realtime-1",
        answerSdp: ANSWER,
        applicationThreadId: THREAD,
      }),
    )

    const result = await exchangeRealtimeOffer(offer(), deps)

    expect(result).toEqual({
      threadId: "realtime-1",
      answerSdp: ANSWER,
      boundApplicationThreadId: THREAD,
    })
    const request = deps.calls[0]!
    expect(new URL(request.url).pathname).toBe(REALTIME_OFFER_PATH)
    expect(request.method).toBe("POST")
    // The bearer is minted here, on the server — the browser never holds it.
    expect(request.headers.get("authorization")).toBe("Bearer service-token")
    // And so are the two proofs: the browser named a thread, the server said
    // it may speak in it. Eve trusts the signatures, not the claim.
    expect(request.headers.get(AGENT_SESSION_BINDING_HEADER)).toBe(
      PROOF.sessionBindingProof,
    )
    expect(request.headers.get(AGENT_SCOPE_HEADER)).toBe(PROOF.resourceScope)
    expect(request.headers.get(AGENT_SCOPE_PROOF_HEADER)).toBe(PROOF.scopeProof)
    await expect(request.json()).resolves.toEqual({
      offerSdp: OFFER,
      applicationThreadId: THREAD,
    })
  })

  it("sends nothing when the thread cannot be proved for this principal", async () => {
    const deps = dependencies(
      () => Response.json({ threadId: "realtime-1", answerSdp: ANSWER }),
      () => Promise.reject(new Error("Agent session was not found.")),
    )

    const result = await exchangeRealtimeOffer(offer("someone-elses"), deps)

    expect(result).toMatchObject({ error: expect.any(String) })
    // No offer leaves this process for a thread the principal cannot claim.
    expect(deps.calls).toHaveLength(0)
  })

  it("refuses an offer with no thread to bind to", async () => {
    const deps = dependencies(() => Response.json({}))
    const proveThread = vi.fn(() => Promise.resolve(PROOF))

    await expect(
      exchangeRealtimeOffer(offer("   "), { ...deps, proveThread }),
    ).resolves.toMatchObject({ error: expect.stringMatching(/conversation/i) })
    expect(proveThread).not.toHaveBeenCalled()
    expect(deps.calls).toHaveLength(0)
  })

  it("treats an answer that does not confirm the binding as unusable", async () => {
    const unconfirmed = dependencies(() =>
      Response.json({ threadId: "realtime-1", answerSdp: ANSWER }),
    )
    const mismatched = dependencies(() =>
      Response.json({
        threadId: "realtime-1",
        answerSdp: ANSWER,
        applicationThreadId: "another-thread",
      }),
    )

    await expect(exchangeRealtimeOffer(offer(), unconfirmed)).resolves.toMatchObject({
      error: expect.stringMatching(/binding/i),
    })
    await expect(exchangeRealtimeOffer(offer(), mismatched)).resolves.toMatchObject({
      error: expect.stringMatching(/binding/i),
    })
  })

  it("passes Eve's refusal message through instead of a bare status", async () => {
    const deps = dependencies(() =>
      Response.json(
        { error: "Voice is live on thread other-thread." },
        { status: 409 },
      ),
    )

    await expect(exchangeRealtimeOffer(offer(), deps)).resolves.toEqual({
      error: "Voice is live on thread other-thread.",
    })
  })

  it("degrades to an error result when Eve is unreachable", async () => {
    const deps = dependencies(() => {
      throw new Error("ECONNREFUSED")
    })

    const result = await exchangeRealtimeOffer(offer(), deps)

    expect(result).toMatchObject({ error: expect.stringMatching(/unavailable/i) })
  })

  it("treats a malformed answer as an error rather than a live session", async () => {
    const deps = dependencies(() =>
      Response.json({ applicationThreadId: THREAD }),
    )

    await expect(exchangeRealtimeOffer(offer(), deps)).resolves.toMatchObject({
      error: expect.stringMatching(/unusable/i),
    })
  })

  it("does not spend a request on an empty offer", async () => {
    const deps = dependencies(() => Response.json({}))

    await expect(
      exchangeRealtimeOffer({ offerSdp: "   ", applicationThreadId: THREAD }, deps),
    ).resolves.toMatchObject({ error: expect.any(String) })
    expect(deps.calls).toHaveLength(0)
  })
})

describe("ending the session", () => {
  it("names the thread whose call it is ending", async () => {
    const deps = dependencies(() =>
      Response.json({ stopped: true, applicationThreadId: THREAD }),
    )

    await expect(requestRealtimeStop(THREAD, deps)).resolves.toBe(true)
    const request = deps.calls[0]!
    expect(new URL(request.url).pathname).toBe(REALTIME_STOP_PATH)
    expect(request.headers.get("authorization")).toBe("Bearer service-token")
    await expect(request.json()).resolves.toEqual({
      applicationThreadId: THREAD,
    })
  })

  it("never throws when teardown fails — the browser has already hung up", async () => {
    const failing = dependencies(() => {
      throw new Error("ECONNREFUSED")
    })
    const refusing = dependencies(() => new Response(null, { status: 500 }))

    await expect(requestRealtimeStop(THREAD, failing)).resolves.toBe(false)
    await expect(requestRealtimeStop(THREAD, refusing)).resolves.toBe(false)
  })

  it("reports false when the host says nothing was stopped", async () => {
    const deps = dependencies(() => Response.json({ stopped: false }))
    const token = vi.fn(() => Promise.resolve("service-token"))

    await expect(
      requestRealtimeStop(THREAD, { ...deps, getEveToken: token }),
    ).resolves.toBe(false)
    expect(token).toHaveBeenCalledTimes(1)
  })

  it("spends no request when there is no thread to stop", async () => {
    const deps = dependencies(() => Response.json({ stopped: true }))

    await expect(requestRealtimeStop("  ", deps)).resolves.toBe(false)
    expect(deps.calls).toHaveLength(0)
  })
})
