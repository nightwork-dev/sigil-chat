import { describe, expect, it } from "vitest"

import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"
import { issueAgentSessionBinding } from "@workspace/agent-contracts/session-binding.server"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import { issueScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"

import { RealtimeAppServerError } from "./realtime-appserver"
import { requireAuthorizedResourceScope } from "./scope-authorization"
import {
  createRealtimeVoiceRoutes,
  REALTIME_BOUNDARY_CONTEXT,
  REALTIME_OFFER_PATH,
  REALTIME_STOP_PATH,
  RealtimeVoiceHost,
  voiceResourceScope,
  type RealtimeVoiceClient,
} from "./realtime-voice"

const OFFER = "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
const ANSWER = "v=0\r\na=ice-lite\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
const SECRET = "test-binding-secret"
const THREAD = "thread-42"
const OTHER_THREAD = "thread-99"

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
        threadId: behavior.threadId ?? "realtime-1",
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

/** The web server's half of the handshake, for real: the same signed session
 *  binding and scope delegation `agent-sessions.tsx` mints for every text turn,
 *  so these tests exercise the production verification path rather than a
 *  stand-in for it. */
function proofHeaders(
  options: {
    subject?: string
    applicationThreadId?: string
    scopeThreadId?: string
    secret?: string
    bindingSecret?: string
    scopeSecret?: string
    omitBinding?: boolean
    omitScope?: boolean
  } = {},
): Record<string, string> {
  const subject = options.subject ?? "owner-1"
  const applicationThreadId = options.applicationThreadId ?? THREAD
  const expiresAt = Math.floor(Date.now() / 1_000) + 60
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (!options.omitBinding) {
    headers[AGENT_SESSION_BINDING_HEADER] = issueAgentSessionBinding(
      {
        applicationThreadId,
        personaId: "sigil-chat-eve",
        homeScopeId: "scope-home",
        initialPerspective: { focusScopeId: "scope-home", viaScopeIds: [] },
        additionalContextScopeIds: [],
        expiresAt,
        subject,
      },
      options.bindingSecret ?? options.secret ?? SECRET,
    )
  }
  if (!options.omitScope) {
    const scope = voiceResourceScope(
      options.scopeThreadId ?? applicationThreadId,
    )
    headers["x-sigil-scope"] = scope
    headers[AGENT_SCOPE_PROOF_HEADER] = issueScopeDelegation(
      { expiresAt, scope, subject },
      options.scopeSecret ?? options.secret ?? SECRET,
    )
  }
  return headers
}

function routes(
  authenticate: Parameters<typeof createRealtimeVoiceRoutes>[0],
  host: RealtimeVoiceHost,
) {
  const [offer, stop] = createRealtimeVoiceRoutes(authenticate, host, {
    bindingSecret: SECRET,
    // Identical to the production default, with the test's secret: session
    // scopes are possession-gated by their signed proof, so the real
    // verification runs without opening the container registries.
    authorizeResourceScope: ({ principalId, request }) =>
      requireAuthorizedResourceScope({
        action: "tool",
        principalId,
        request,
        secret: SECRET,
      }),
  })
  const call =
    (route: typeof offer) =>
    (body: unknown, headers: Record<string, string> = proofHeaders()) =>
      route!.handler(
        new Request(`http://agent.test${route!.path}`, {
          method: "POST",
          body: JSON.stringify(body),
          headers,
        }),
        {} as never,
      )
  return { offer: call(offer), stop: call(stop) }
}

const offerBody = (applicationThreadId = THREAD) => ({
  offerSdp: OFFER,
  applicationThreadId,
})

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
    const response = await routes(anonymous, host).offer(offerBody())

    expect(response.status).toBe(401)
    // Auth is checked BEFORE the app-server is touched: an unauthenticated
    // request must not even spawn a codex process.
    expect(created).toHaveLength(0)
    expect(host.liveCall).toBeUndefined()
  })

  it("refuses a stop with no verified principal", async () => {
    const host = new RealtimeVoiceHost({ createClient: () => fakeClient() })
    const response = await routes(anonymous, host).stop({
      applicationThreadId: THREAD,
    })
    expect(response.status).toBe(401)
  })
})

describe("binding the call to a real application thread", () => {
  function guarded() {
    const created: FakeClient[] = []
    const host = new RealtimeVoiceHost({
      createClient: () => {
        const client = fakeClient()
        created.push(client)
        return client
      },
    })
    return { created, host, call: routes(principal("owner-1"), host) }
  }

  it("relays the offer and answers with the thread the call is bound to", async () => {
    const client = fakeClient({ threadId: "realtime-7" })
    const host = new RealtimeVoiceHost({ createClient: () => client })

    const response = await routes(principal("owner-1"), host).offer(offerBody())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      threadId: "realtime-7",
      answerSdp: ANSWER,
      applicationThreadId: THREAD,
    })
    expect(client.offers).toEqual([OFFER])
    expect(host.liveCall).toEqual({
      applicationThreadId: THREAD,
      principalId: "owner-1",
      threadId: "realtime-7",
    })
  })

  it("refuses an offer that names no application thread", async () => {
    const { created, call } = guarded()

    const response = await call.offer({ offerSdp: OFFER })

    expect(response.status).toBe(400)
    expect(created).toHaveLength(0)
  })

  it("refuses an unsigned thread claim — the browser's word is not enough", async () => {
    const { created, call, host } = guarded()

    const response = await call.offer(
      offerBody(),
      proofHeaders({ omitBinding: true }),
    )

    expect(response.status).toBe(403)
    expect(created).toHaveLength(0)
    expect(host.liveCall).toBeUndefined()
  })

  it("refuses a binding signed for a different thread than the offer names", async () => {
    const { created, call } = guarded()

    const response = await call.offer(
      offerBody(THREAD),
      proofHeaders({ applicationThreadId: OTHER_THREAD, scopeThreadId: THREAD }),
    )

    expect(response.status).toBe(403)
    expect(created).toHaveLength(0)
  })

  it("refuses a binding minted for another principal", async () => {
    const { created, call } = guarded()

    const response = await call.offer(
      offerBody(),
      proofHeaders({ subject: "owner-2" }),
    )

    expect(response.status).toBe(403)
    expect(created).toHaveLength(0)
  })

  it("refuses a binding signed with the wrong secret", async () => {
    const { created, call } = guarded()

    const response = await call.offer(
      offerBody(),
      proofHeaders({ bindingSecret: "not-the-secret" }),
    )

    expect(response.status).toBe(403)
    expect(created).toHaveLength(0)
  })
})

describe("server-side scope authorization", () => {
  // Falsification: delete the scope check from the offer route and every test
  // in this block goes green-to-red, because a valid session binding alone
  // would then be enough to open a call.
  function guarded() {
    const created: FakeClient[] = []
    const host = new RealtimeVoiceHost({
      createClient: () => {
        const client = fakeClient()
        created.push(client)
        return client
      },
    })
    return { created, host, call: routes(principal("owner-1"), host) }
  }

  it("refuses an offer carrying no resource-scope proof", async () => {
    const { created, call, host } = guarded()

    const response = await call.offer(
      offerBody(),
      proofHeaders({ omitScope: true }),
    )

    expect(response.status).toBe(403)
    expect(created).toHaveLength(0)
    expect(host.liveCall).toBeUndefined()
  })

  it("refuses a scope proof signed with the wrong secret", async () => {
    const { created, call } = guarded()

    const response = await call.offer(
      offerBody(),
      proofHeaders({ scopeSecret: "not-the-secret" }),
    )

    expect(response.status).toBe(403)
    expect(created).toHaveLength(0)
  })

  it("refuses a scope authorized for a different thread", async () => {
    const { created, call } = guarded()

    const response = await call.offer(
      offerBody(THREAD),
      proofHeaders({ scopeThreadId: OTHER_THREAD }),
    )

    expect(response.status).toBe(403)
    expect(created).toHaveLength(0)
  })

  it("says only that the call is not authorized, never which proof failed", async () => {
    const { call } = guarded()

    const [noBinding, noScope] = await Promise.all([
      call
        .offer(offerBody(), proofHeaders({ omitBinding: true }))
        .then((response) => response.json()),
      call
        .offer(offerBody(), proofHeaders({ omitScope: true }))
        .then((response) => response.json()),
    ])

    expect(noBinding).toEqual(noScope)
  })
})

describe("realtime voice offer relay", () => {
  // P0 containment (LIVE-VOICE-HARNESS-ASSESSMENT): the realtime thread is a
  // separate agent boundary until P2 binds it, so every session must open
  // with a developer context that says so. Injection alone isn't the claim —
  // the claim is that it truthfully names the boundary, so the assertions
  // pin the load-bearing denials, not just any non-empty string.
  it("opens every session with the truthful boundary context", async () => {
    const client = fakeClient()
    const host = new RealtimeVoiceHost({ createClient: () => client })

    await routes(principal("owner-1"), host).offer(offerBody())

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

    await expect(
      call.offer({ applicationThreadId: THREAD }).then((r) => r.status),
    ).resolves.toBe(400)
    await expect(
      call
        .offer({ offerSdp: "  ", applicationThreadId: THREAD })
        .then((r) => r.status),
    ).resolves.toBe(400)
    expect(created).toHaveLength(0)
  })

  it("surfaces an app-server refusal message rather than a bare status", async () => {
    const failure = new RealtimeAppServerError(
      "thread/realtime/start failed: Voice session access denied",
    )
    const client = fakeClient({ failStartWith: failure })
    const host = new RealtimeVoiceHost({ createClient: () => client })

    const response = await routes(principal("owner-1"), host).offer(offerBody())

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: failure.message })
    // The failed start left no live session and no undisposed child.
    expect(host.liveCall).toBeUndefined()
    expect(client.disposals).toHaveLength(1)
  })
})

describe("one live call, owned by a thread and a principal", () => {
  // Falsification: key ownership by principal alone (drop applicationThreadId
  // from the comparison) and the two-threads test below goes red — the second
  // call would silently replace the first, which is exactly the acceptance
  // test 8 failure the assessment names.
  it("refuses the same principal a second call in another thread, by name", async () => {
    const first = fakeClient({ threadId: "realtime-first" })
    const second = fakeClient({ threadId: "realtime-second" })
    const clients = [first, second]
    const host = new RealtimeVoiceHost({ createClient: () => clients.shift()! })

    await routes(principal("owner-1"), host).offer(offerBody(THREAD))
    const response = await routes(principal("owner-1"), host).offer(
      offerBody(OTHER_THREAD),
      proofHeaders({ applicationThreadId: OTHER_THREAD }),
    )

    expect(response.status).toBe(409)
    // The conflict names the thread that holds voice — a message that says
    // only "busy" leaves the user with no way to find their own live call.
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining(THREAD),
    })
    // The first call is untouched: no silent replacement, no orphaned process.
    expect(first.disposals).toHaveLength(0)
    expect(second.offers).toHaveLength(0)
    expect(host.liveCall).toMatchObject({
      applicationThreadId: THREAD,
      principalId: "owner-1",
    })
  })

  it("refuses a second principal without naming the thread that holds voice", async () => {
    const first = fakeClient({ threadId: "realtime-first" })
    const second = fakeClient({ threadId: "realtime-second" })
    const clients = [first, second]
    const host = new RealtimeVoiceHost({ createClient: () => clients.shift()! })

    await routes(principal("owner-1"), host).offer(offerBody())
    const response = await routes(principal("owner-2"), host).offer(
      offerBody(OTHER_THREAD),
      proofHeaders({ subject: "owner-2", applicationThreadId: OTHER_THREAD }),
    )

    expect(response.status).toBe(409)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).not.toContain(THREAD)
    expect(host.liveCall).toMatchObject({ principalId: "owner-1" })
    expect(first.disposals).toHaveLength(0)
    expect(second.offers).toHaveLength(0)
  })

  it("lets the owner renegotiate the same thread, disposing the call it replaces", async () => {
    const first = fakeClient({ threadId: "realtime-first" })
    const second = fakeClient({ threadId: "realtime-second" })
    const clients = [first, second]
    const host = new RealtimeVoiceHost({ createClient: () => clients.shift()! })
    const call = routes(principal("owner-1"), host)

    await call.offer(offerBody())
    const response = await call.offer(offerBody())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      threadId: "realtime-second",
      applicationThreadId: THREAD,
    })
    expect(first.disposals).toHaveLength(1)
    expect(host.liveCall).toMatchObject({
      applicationThreadId: THREAD,
      principalId: "owner-1",
    })
  })

  it("refuses a concurrent second caller while the first start is still in flight", async () => {
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

    const first = routes(principal("owner-1"), host).offer(offerBody(THREAD))
    const second = await routes(principal("owner-1"), host).offer(
      offerBody(OTHER_THREAD),
      proofHeaders({ applicationThreadId: OTHER_THREAD }),
    )

    expect(second.status).toBe(409)
    expect(created).toHaveLength(1)
    release!()
    await expect(first.then((r) => r.status)).resolves.toBe(200)
  })
})

describe("stopping a live call", () => {
  it("stops and disposes the caller's own call, naming the thread it ended", async () => {
    const client = fakeClient()
    const host = new RealtimeVoiceHost({ createClient: () => client })
    const call = routes(principal("owner-1"), host)
    await call.offer(offerBody())

    const response = await call.stop({ applicationThreadId: THREAD })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      stopped: true,
      applicationThreadId: THREAD,
    })
    expect(client.stops).toBe(1)
    expect(client.disposals).toHaveLength(1)
    expect(host.liveCall).toBeUndefined()
  })

  it("refuses to end a call bound to a different thread of the same principal", async () => {
    const client = fakeClient()
    const host = new RealtimeVoiceHost({ createClient: () => client })
    const call = routes(principal("owner-1"), host)
    await call.offer(offerBody(THREAD))

    const response = await call.stop({ applicationThreadId: OTHER_THREAD })

    await expect(response.json()).resolves.toEqual({
      stopped: false,
      applicationThreadId: OTHER_THREAD,
    })
    expect(client.stops).toBe(0)
    expect(host.liveCall).toMatchObject({ applicationThreadId: THREAD })
  })

  it("requires the thread it is ending to be named", async () => {
    const client = fakeClient()
    const host = new RealtimeVoiceHost({ createClient: () => client })
    const call = routes(principal("owner-1"), host)
    await call.offer(offerBody())

    const response = await call.stop({})

    expect(response.status).toBe(400)
    expect(client.stops).toBe(0)
    expect(host.liveCall).toMatchObject({ applicationThreadId: THREAD })
  })

  it("leaves another principal's call running", async () => {
    const client = fakeClient()
    const host = new RealtimeVoiceHost({ createClient: () => client })
    await routes(principal("owner-1"), host).offer(offerBody())

    const response = await routes(principal("owner-2"), host).stop({
      applicationThreadId: THREAD,
    })

    await expect(response.json()).resolves.toMatchObject({ stopped: false })
    expect(client.stops).toBe(0)
    expect(host.liveCall).toMatchObject({ principalId: "owner-1" })
  })

  it("disposes the client even when the stop call itself fails", async () => {
    const client = fakeClient({
      failStopWith: new RealtimeAppServerError("the child already exited"),
    })
    const host = new RealtimeVoiceHost({ createClient: () => client })
    const call = routes(principal("owner-1"), host)
    await call.offer(offerBody())

    const response = await call.stop({ applicationThreadId: THREAD })

    // The route degrades rather than throwing, and the process is gone either
    // way — a stop that fails must not leave codex running forever.
    expect(response.status).toBe(200)
    expect(client.disposals).toHaveLength(1)
    expect(host.liveCall).toBeUndefined()
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

    const offer = call.offer(offerBody())
    await negotiating
    const stopped = await call.stop({ applicationThreadId: THREAD })
    await expect(stopped.json()).resolves.toMatchObject({ stopped: true })
    // The client is disposed before its own start ever resolves.
    expect(client.disposals.length).toBeGreaterThan(0)

    release()
    const response = await offer

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/cancelled/i),
    })
    // Nothing was published: no live call survives the hang-up.
    expect(host.liveCall).toBeUndefined()
  })

  it("does not let a stop on another thread cancel a pending start", async () => {
    const { host, client, negotiating, release } = gatedHost()
    const call = routes(principal("owner-1"), host)

    const offer = call.offer(offerBody(THREAD))
    await negotiating
    const stopped = await call.stop({ applicationThreadId: OTHER_THREAD })

    await expect(stopped.json()).resolves.toMatchObject({ stopped: false })
    expect(client.disposals).toHaveLength(0)
    release()
    await expect(offer.then((r) => r.status)).resolves.toBe(200)
    expect(host.liveCall).toMatchObject({ applicationThreadId: THREAD })
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
    const second = fakeClient({ threadId: "realtime-second" })
    const clients: FakeClient[] = [gated, second]
    const host = new RealtimeVoiceHost({ createClient: () => clients.shift()! })

    const abandoned = routes(principal("owner-1"), host).offer(offerBody())
    await negotiating
    await routes(principal("owner-1"), host).stop({
      applicationThreadId: THREAD,
    })
    release!()
    await expect(abandoned.then((r) => r.status)).resolves.toBe(409)

    // A different principal is no longer refused, because nothing is held.
    const response = await routes(principal("owner-2"), host).offer(
      offerBody(OTHER_THREAD),
      proofHeaders({ subject: "owner-2", applicationThreadId: OTHER_THREAD }),
    )
    expect(response.status).toBe(200)
    expect(host.liveCall).toMatchObject({
      applicationThreadId: OTHER_THREAD,
      principalId: "owner-2",
    })
  })

  it("does not let one principal cancel another's pending start", async () => {
    const { host, client, negotiating, release } = gatedHost()

    const offer = routes(principal("owner-1"), host).offer(offerBody())
    await negotiating
    const stopped = await routes(principal("owner-2"), host).stop({
      applicationThreadId: THREAD,
    })

    await expect(stopped.json()).resolves.toMatchObject({ stopped: false })
    expect(client.disposals).toHaveLength(0)
    release()
    await expect(offer.then((r) => r.status)).resolves.toBe(200)
    expect(host.liveCall).toMatchObject({ principalId: "owner-1" })
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
