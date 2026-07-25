import { describe, expect, it } from "vitest"

import { RealtimeAppServerError } from "./realtime-appserver"
import {
  createRealtimeVoiceRoutes,
  REALTIME_BOUNDARY_CONTEXT,
  REALTIME_OFFER_PATH,
  REALTIME_STOP_PATH,
  RealtimeVoiceHost,
  type RealtimeVoiceClient,
} from "./realtime-voice"

const OFFER = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
const ANSWER = "v=0\r\na=ice-lite\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"

interface FakeClient extends RealtimeVoiceClient {
  readonly offers: string[]
  readonly prompts: (string | undefined)[]
  readonly stops: number
  readonly disposals: string[]
}

function fakeClient(
  behavior: {
    threadId?: string
    answerSdp?: string
    failStartWith?: Error
    failStopWith?: Error
  } = {},
): FakeClient {
  const offers: string[] = []
  const prompts: (string | undefined)[] = []
  const disposals: string[] = []
  let stops = 0
  return {
    offers,
    prompts,
    disposals,
    get stops() {
      return stops
    },
    async start(offerSdp, options) {
      offers.push(offerSdp)
      prompts.push(options?.prompt)
      if (behavior.failStartWith) throw behavior.failStartWith
      return {
        threadId: behavior.threadId ?? "thread-1",
        answerSdp: behavior.answerSdp ?? ANSWER,
      }
    },
    async stop() {
      stops += 1
      if (behavior.failStopWith) throw behavior.failStopWith
    },
    dispose(reason) {
      disposals.push(reason ?? "")
    },
  }
}

const anonymous = () => Promise.resolve(null)

const principal = (principalId: string) => () =>
  Promise.resolve({
    attributes: {},
    authenticator: "test",
    principalId,
    principalType: "user" as const,
  })

function routes(
  authenticate: Parameters<typeof createRealtimeVoiceRoutes>[0],
  host: RealtimeVoiceHost,
) {
  const [offer, stop] = createRealtimeVoiceRoutes(authenticate, host)
  const call = (route: (typeof offer)) => (body: unknown) =>
    route.handler(
      new Request(`http://agent.test${route.path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      {} as never,
    )
  return { offer: call(offer!), stop: call(stop!) }
}

describe("realtime voice route auth", () => {
  it("refuses an offer with no verified principal", async () => {
    const created: FakeClient[] = []
    const host = new RealtimeVoiceHost({
      createClient: () => {
        const client = fakeClient()
        created.push(client)
        return client
      },
    })
    const response = await routes(anonymous, host).offer({ offerSdp: OFFER })

    expect(response.status).toBe(401)
    // Auth is checked BEFORE the app-server is touched: an unauthenticated
    // request must not even spawn a codex process.
    expect(created).toHaveLength(0)
    expect(host.liveOwnerId).toBeUndefined()
  })

  it("refuses a stop with no verified principal", async () => {
    const host = new RealtimeVoiceHost({ createClient: () => fakeClient() })
    const response = await routes(anonymous, host).stop({})
    expect(response.status).toBe(401)
  })
})

describe("realtime voice offer relay", () => {
  it("relays the browser offer and returns the answer with its thread", async () => {
    const client = fakeClient({ threadId: "thread-42" })
    const host = new RealtimeVoiceHost({ createClient: () => client })

    const response = await routes(principal("owner-1"), host).offer({
      offerSdp: OFFER,
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      threadId: "thread-42",
      answerSdp: ANSWER,
    })
    expect(client.offers).toEqual([OFFER])
    expect(host.liveOwnerId).toBe("owner-1")
  })

  // P0 containment (LIVE-VOICE-HARNESS-ASSESSMENT): the realtime thread is a
  // separate agent boundary until P2 binds it, so every session must open
  // with a developer context that says so. Injection alone isn't the claim —
  // the claim is that it truthfully names the boundary, so the assertions
  // pin the load-bearing denials, not just any non-empty string.
  it("opens every session with the truthful boundary context", async () => {
    const client = fakeClient()
    const host = new RealtimeVoiceHost({ createClient: () => client })

    await routes(principal("owner-1"), host).offer({ offerSdp: OFFER })

    expect(client.prompts).toEqual([REALTIME_BOUNDARY_CONTEXT])
    expect(REALTIME_BOUNDARY_CONTEXT).toContain("NOT the Sigil application-thread agent")
    expect(REALTIME_BOUNDARY_CONTEXT).toContain("Never claim to see or act on the app's UI state")
  })

  it("rejects a request with no offer SDP without starting a session", async () => {
    const created: FakeClient[] = []
    const host = new RealtimeVoiceHost({
      createClient: () => {
        const client = fakeClient()
        created.push(client)
        return client
      },
    })
    const call = routes(principal("owner-1"), host)

    await expect(call.offer({}).then((r) => r.status)).resolves.toBe(400)
    await expect(call.offer({ offerSdp: "  " }).then((r) => r.status)).resolves.toBe(400)
    expect(created).toHaveLength(0)
  })

  it("surfaces an app-server refusal message rather than a bare status", async () => {
    const failure = new RealtimeAppServerError(
      "thread/realtime/start failed: Voice session access denied",
    )
    const client = fakeClient({ failStartWith: failure })
    const host = new RealtimeVoiceHost({ createClient: () => client })

    const response = await routes(principal("owner-1"), host).offer({
      offerSdp: OFFER,
    })

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: failure.message })
    // The failed start left no live session and no undisposed child.
    expect(host.liveOwnerId).toBeUndefined()
    expect(client.disposals).toHaveLength(1)
  })
})

describe("one live session per host", () => {
  it("refuses a second principal instead of displacing the first", async () => {
    const first = fakeClient({ threadId: "thread-first" })
    const second = fakeClient({ threadId: "thread-second" })
    const clients = [first, second]
    const host = new RealtimeVoiceHost({ createClient: () => clients.shift()! })

    await routes(principal("owner-1"), host).offer({ offerSdp: OFFER })
    const response = await routes(principal("owner-2"), host).offer({
      offerSdp: OFFER,
    })

    expect(response.status).toBe(409)
    expect(host.liveOwnerId).toBe("owner-1")
    expect(first.disposals).toHaveLength(0)
    expect(second.offers).toHaveLength(0)
  })

  it("lets the owner renegotiate, disposing the session it replaces", async () => {
    const first = fakeClient({ threadId: "thread-first" })
    const second = fakeClient({ threadId: "thread-second" })
    const clients = [first, second]
    const host = new RealtimeVoiceHost({ createClient: () => clients.shift()! })
    const call = routes(principal("owner-1"), host)

    await call.offer({ offerSdp: OFFER })
    const response = await call.offer({ offerSdp: OFFER })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      threadId: "thread-second",
    })
    expect(first.disposals).toHaveLength(1)
    expect(host.liveOwnerId).toBe("owner-1")
  })

  it("refuses a concurrent second principal while the first start is still in flight", async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const created: FakeClient[] = []
    const host = new RealtimeVoiceHost({
      createClient: () => {
        const base = fakeClient()
        const client: FakeClient = {
          ...base,
          get stops() {
            return base.stops
          },
          async start(offerSdp) {
            await gate
            return base.start(offerSdp)
          },
        }
        created.push(client)
        return client
      },
    })

    const first = routes(principal("owner-1"), host).offer({ offerSdp: OFFER })
    const second = await routes(principal("owner-2"), host).offer({
      offerSdp: OFFER,
    })

    expect(second.status).toBe(409)
    expect(created).toHaveLength(1)
    release!()
    await expect(first.then((r) => r.status)).resolves.toBe(200)
  })
})

describe("stopping a live session", () => {
  it("stops and disposes the caller's own session", async () => {
    const client = fakeClient()
    const host = new RealtimeVoiceHost({ createClient: () => client })
    const call = routes(principal("owner-1"), host)
    await call.offer({ offerSdp: OFFER })

    const response = await call.stop({})

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ stopped: true })
    expect(client.stops).toBe(1)
    expect(client.disposals).toHaveLength(1)
    expect(host.liveOwnerId).toBeUndefined()
  })

  it("leaves another principal's session running", async () => {
    const client = fakeClient()
    const host = new RealtimeVoiceHost({ createClient: () => client })
    await routes(principal("owner-1"), host).offer({ offerSdp: OFFER })

    const response = await routes(principal("owner-2"), host).stop({})

    await expect(response.json()).resolves.toEqual({ stopped: false })
    expect(client.stops).toBe(0)
    expect(host.liveOwnerId).toBe("owner-1")
  })

  it("disposes the client even when the stop call itself fails", async () => {
    const client = fakeClient({
      failStopWith: new RealtimeAppServerError("the child already exited"),
    })
    const host = new RealtimeVoiceHost({ createClient: () => client })
    const call = routes(principal("owner-1"), host)
    await call.offer({ offerSdp: OFFER })

    const response = await call.stop({})

    // The route degrades rather than throwing, and the process is gone either
    // way — a stop that fails must not leave codex running forever.
    expect(response.status).toBe(200)
    expect(client.disposals).toHaveLength(1)
    expect(host.liveOwnerId).toBeUndefined()
  })
})

describe("hanging up during the connect wait", () => {
  // Starting a realtime session is slow — codex emits its whole MCP startup
  // sequence before the answer arrives — so cancelling mid-negotiation is the
  // ordinary path. A cancel the host ignores leaves a live call with nobody
  // attached and a codex process that outlives the user's session.
  function gatedHost() {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered: (() => void) | undefined
    // Resolves once the host has actually reached `client.start` — the point
    // from which a negotiation is genuinely in flight. Without waiting for it
    // a test can stop before the handler has even read its own body, which
    // proves nothing about cancelling a pending start.
    const negotiating = new Promise<void>((resolve) => {
      entered = resolve
    })
    const base = fakeClient()
    const client: FakeClient = {
      ...base,
      get stops() {
        return base.stops
      },
      async start(offerSdp) {
        entered!()
        await gate
        return base.start(offerSdp)
      },
    }
    const host = new RealtimeVoiceHost({ createClient: () => client })
    return { host, client, negotiating, release: () => release!() }
  }

  it("kills the negotiation instead of letting it come up orphaned", async () => {
    const { host, client, negotiating, release } = gatedHost()
    const call = routes(principal("owner-1"), host)

    const offer = call.offer({ offerSdp: OFFER })
    await negotiating
    const stopped = await call.stop({})
    await expect(stopped.json()).resolves.toEqual({ stopped: true })
    // The client is disposed before its own start ever resolves.
    expect(client.disposals.length).toBeGreaterThan(0)

    release()
    const response = await offer

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/cancelled/i),
    })
    // Nothing was published: no live session survives the hang-up.
    expect(host.liveOwnerId).toBeUndefined()
  })

  it("frees the host for the next caller once a pending start is cancelled", async () => {
    // Two clients on one host: the first parks on its gate, the second is a
    // plain one, so the assertion is about the HOST's slot being free rather
    // than about a fresh host trivially accepting a call.
    let release: (() => void) | undefined
    let entered: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const negotiating = new Promise<void>((resolve) => {
      entered = resolve
    })
    const first = fakeClient()
    const gated: FakeClient = {
      ...first,
      get stops() {
        return first.stops
      },
      async start(offerSdp) {
        entered!()
        await gate
        return first.start(offerSdp)
      },
    }
    const second = fakeClient({ threadId: "thread-second" })
    const clients: FakeClient[] = [gated, second]
    const host = new RealtimeVoiceHost({ createClient: () => clients.shift()! })

    const abandoned = routes(principal("owner-1"), host).offer({
      offerSdp: OFFER,
    })
    await negotiating
    await routes(principal("owner-1"), host).stop({})
    release!()
    await expect(abandoned.then((r) => r.status)).resolves.toBe(409)

    // A different principal is no longer refused, because nothing is held.
    const response = await routes(principal("owner-2"), host).offer({
      offerSdp: OFFER,
    })
    expect(response.status).toBe(200)
    expect(host.liveOwnerId).toBe("owner-2")
  })

  it("does not let one principal cancel another's pending start", async () => {
    const { host, client, negotiating, release } = gatedHost()

    const offer = routes(principal("owner-1"), host).offer({ offerSdp: OFFER })
    await negotiating
    const stopped = await routes(principal("owner-2"), host).stop({})

    await expect(stopped.json()).resolves.toEqual({ stopped: false })
    expect(client.disposals).toHaveLength(0)
    release()
    await expect(offer.then((r) => r.status)).resolves.toBe(200)
    expect(host.liveOwnerId).toBe("owner-1")
  })
})

describe("route paths", () => {
  it("mounts the documented POST paths", () => {
    const host = new RealtimeVoiceHost({ createClient: () => fakeClient() })
    const [offer, stop] = createRealtimeVoiceRoutes(principal("owner-1"), host)
    expect([offer!.method, offer!.path]).toEqual(["POST", REALTIME_OFFER_PATH])
    expect([stop!.method, stop!.path]).toEqual(["POST", REALTIME_STOP_PATH])
  })
})
