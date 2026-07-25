// The SDP relay: the browser's offer in, Codex's answer out, nothing else.
//
// D-1 gave us a JSON-RPC client that drives `codex app-server`'s realtime
// surface. This is the authenticated seam that lets the browser reach it. It
// deliberately relays two strings and no media: audio flows browser <-> OpenAI
// directly (spec, "The no-API-key path"), so this process never sees a
// credential, an audio frame, or an upstream call id.
//
// P1 (LIVE-VOICE-HARNESS-ASSESSMENT) made the call belong to a REAL Sigil
// application thread rather than to a principal alone. The offer therefore
// carries the same two server-minted proofs every text turn carries — the
// signed session binding (which thread, which subject) and the signed resource
// scope — and both are verified here before a codex process is spawned. The
// browser's own claim about which thread it is in is never sufficient.
//
// One live session per host, owned by (application thread, principal). Another
// principal is refused rather than displaced; the SAME principal calling from a
// DIFFERENT thread is also refused, by name, because silently replacing that
// call would move a live microphone to a conversation the user is not looking
// at. Only a renegotiation of the same thread by the same principal (a reload,
// a second tab) replaces its own session, after the old one is disposed.
//
// Everything below is injectable: `createClient` defaults to the real
// app-server client, and every test supplies a fake, so the whole relay —
// including the failure and conflict paths — runs without spawning codex.

import { POST, type HttpRouteDefinition } from "eve/channels"
import type { AuthFn } from "eve/channels/auth"
import type { AgentSessionBindingPayload } from "@workspace/agent-contracts/session-binding"
import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"
import { readAgentSessionBinding } from "@workspace/agent-contracts/session-binding.server"

import {
  RealtimeAppServerClient,
  RealtimeAppServerError,
} from "./realtime-appserver"
import { requireAuthorizedResourceScope } from "./scope-authorization"

export const REALTIME_OFFER_PATH = "/sigil/v1/realtime/offer"
export const REALTIME_STOP_PATH = "/sigil/v1/realtime/stop"

/**
 * P0 containment from docs/specs/LIVE-VOICE-HARNESS-ASSESSMENT-20260725.md —
 * authored by the voice agent itself after correctly diagnosing its own
 * boundary. Until P2 binds the call to the real Eve session, the realtime
 * thread must not be allowed to claim capabilities it does not have. This is
 * a truthful disclosure, not the fix: the fix is the P1/P2 binding work.
 */
export const REALTIME_BOUNDARY_CONTEXT = [
  "You are the LIVE VOICE agent for Sigil Chat, running as a separate local",
  "Codex realtime thread. You are NOT the Sigil application-thread agent the",
  "user's UI shows: you cannot see the current route, workspace, selection,",
  "context-privacy choices, the bound persona, the application thread's",
  "transcript, its memory or blackboard, or its Sigil application tools.",
  "Never claim to see or act on the app's UI state. If asked to act on the",
  "Sigil application (open, annotate, record, change settings), say plainly",
  "that this experimental voice session is not yet connected to those tools",
  "and the user should use text chat for that. Any local file or command",
  "authority you have belongs to this machine's Codex harness, not to the",
  "Sigil agent — name that distinction if it matters to the user's request.",
].join(" ")

export interface RealtimeVoiceStartResult {
  threadId: string
  answerSdp: string
}

/** The slice of the D-1 client this seam depends on — nothing more, so a
 *  test fake is four lines rather than a mock of the whole JSON-RPC surface. */
export interface RealtimeVoiceClient {
  start(
    offerSdp: string,
    options?: { prompt?: string },
  ): Promise<RealtimeVoiceStartResult>
  stop(): Promise<void>
  dispose(reason?: string): void
}

export class RealtimeVoiceConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RealtimeVoiceConflictError"
  }
}

/** The caller hung up while its own negotiation was still in flight. */
export class RealtimeVoiceCancelledError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RealtimeVoiceCancelledError"
  }
}

export interface RealtimeVoiceHostOptions {
  createClient?: () => RealtimeVoiceClient
}

/**
 * A per-session launch plan. VOX.5 always used the host's default client and
 * the containment prompt; VOX.6.1 lets the offer route hand the host a client
 * configured for an isolated CODEX_HOME (the coordinator MCP surface) plus the
 * prompt that goes with it, and a `dispose` that tears down the per-session
 * home. Absent, the host falls back to the containment-only behaviour — which
 * stays the correct secure default when the coordinator cannot be wired.
 */
export interface RealtimeVoiceSessionPlan {
  createClient(): RealtimeVoiceClient
  prompt: string
  /** Release per-session resources (the isolated CODEX_HOME). Idempotent. */
  dispose?: () => Promise<void>
}

/**
 * Who a live call belongs to. The application thread is half the key: a call
 * is a capture bound to one conversation, so the same person speaking in two
 * threads is two different calls, not one call that follows them around.
 */
export interface RealtimeVoiceCallOwner {
  readonly applicationThreadId: string
  readonly principalId: string
}

export interface RealtimeVoiceLiveCall extends RealtimeVoiceCallOwner {
  /** The realtime thread id the app-server handed back — not the Sigil one. */
  readonly threadId: string
}

function sameOwner(
  left: RealtimeVoiceCallOwner,
  right: RealtimeVoiceCallOwner,
): boolean {
  return (
    left.principalId === right.principalId &&
    left.applicationThreadId === right.applicationThreadId
  )
}

/** Names the thread that holds voice — but only to the principal that owns it.
 *  Another principal learns that the host is busy and nothing more. */
function conflictMessage(
  holder: RealtimeVoiceCallOwner,
  caller: RealtimeVoiceCallOwner,
): string {
  return holder.principalId === caller.principalId
    ? `Voice is live on thread ${holder.applicationThreadId}. End that call before starting one on another thread.`
    : "Another live voice session is already running on this host."
}

interface LiveSession {
  client: RealtimeVoiceClient
  owner: RealtimeVoiceCallOwner
  threadId: string
  disposePlan?: () => Promise<void>
}

/**
 * Owns at most one realtime session and the client process behind it.
 */
export class RealtimeVoiceHost {
  #createClient: () => RealtimeVoiceClient
  #live: LiveSession | undefined
  /** A negotiation in flight. Held as the client itself, not just an owner,
   *  because a caller that hangs up mid-negotiation has to be able to kill the
   *  process behind it — and starting a realtime session is SLOW (codex emits
   *  its whole MCP startup sequence first), so cancel-during-connect is the
   *  ordinary path, not the rare one. */
  #pending:
    | {
        owner: RealtimeVoiceCallOwner
        client: RealtimeVoiceClient
        disposePlan?: () => Promise<void>
      }
    | undefined

  constructor(options: RealtimeVoiceHostOptions = {}) {
    this.#createClient = options.createClient ?? (() => new RealtimeAppServerClient())
  }

  /** The live call, named by the thread it is bound to. */
  get liveCall(): RealtimeVoiceLiveCall | undefined {
    const live = this.#live
    return live
      ? {
          applicationThreadId: live.owner.applicationThreadId,
          principalId: live.owner.principalId,
          threadId: live.threadId,
        }
      : undefined
  }

  async start(
    owner: RealtimeVoiceCallOwner,
    offerSdp: string,
    plan?: RealtimeVoiceSessionPlan,
  ): Promise<RealtimeVoiceStartResult> {
    // A start in flight has no live session to compare against yet, so the
    // conflict check has to consult it too — otherwise two simultaneous
    // requests both pass the guard and the second one strands the first's
    // codex process with nobody holding a handle to dispose it.
    const holder = this.#live?.owner ?? this.#pending?.owner
    if (holder !== undefined && !sameOwner(holder, owner)) {
      // The plan's per-session home is ours to release: this call never came
      // up, so nothing else will dispose it.
      void plan?.dispose?.()
      throw new RealtimeVoiceConflictError(conflictMessage(holder, owner))
    }
    // The same principal renegotiating the same thread replaces its own
    // session: tear the old one down completely first, so the replacement is
    // never the second start on a client that already holds one.
    this.#disposeLive("Replaced by a new live voice session.")

    const client = plan?.createClient
      ? plan.createClient()
      : this.#createClient()
    const disposePlan = plan?.dispose
    this.#pending = { owner, client, disposePlan }
    try {
      const result = await client.start(offerSdp, {
        prompt: plan?.prompt ?? REALTIME_BOUNDARY_CONTEXT,
      })
      // A stop that landed while this was negotiating already disposed the
      // client and cleared the slot. Publishing the session now would hand the
      // host a live call nobody is attached to.
      if (this.#pending?.client !== client) {
        throw new RealtimeVoiceCancelledError(
          "The live voice session was cancelled before it came up.",
        )
      }
      this.#live = { client, owner, threadId: result.threadId, disposePlan }
      return result
    } catch (error) {
      // A failed start leaves a spawned child behind unless we say otherwise.
      // Dispose is idempotent, so the cancelled path disposing twice is safe.
      client.dispose("The live voice session failed to start.")
      void disposePlan?.()
      throw error
    } finally {
      if (this.#pending?.client === client) this.#pending = undefined
    }
  }

  /** End the caller's own call on the thread it names. A call bound to another
   *  thread — even the caller's own — is never touched, so "stop voice here"
   *  can never silently end a conversation somewhere else. Reporting "nothing
   *  live" to a caller that owns nothing is the honest answer, and it is
   *  idempotent for the browser's cleanup path. */
  async stop(owner: RealtimeVoiceCallOwner): Promise<boolean> {
    // Hanging up during the connect wait is the common case, not an edge: the
    // caller has nothing to show for it yet, and the only way to honour that
    // is to kill the negotiation rather than let it come up orphaned.
    const pending = this.#pending
    if (pending && sameOwner(pending.owner, owner)) {
      this.#pending = undefined
      pending.client.dispose(
        "The live voice session was cancelled before it came up.",
      )
      void pending.disposePlan?.()
      return true
    }

    const live = this.#live
    if (!live || !sameOwner(live.owner, owner)) return false
    try {
      await live.client.stop()
    } finally {
      // Stop can fail (the child already exited, the thread is gone); the
      // process still must not survive it.
      this.#disposeLive("The live voice session was stopped.")
    }
    return true
  }

  #disposeLive(reason: string): void {
    const live = this.#live
    this.#live = undefined
    live?.client.dispose(reason)
    void live?.disposePlan?.()
  }
}

/** The resource scope a live call runs under: the same `session:<thread>` scope
 *  a text turn in that thread carries, so one authorization path covers both. */
export function voiceResourceScope(applicationThreadId: string): string {
  return `session:${applicationThreadId}`
}

/** Verifying the caller may speak into this thread failed. Deliberately one
 *  error for every reason — a caller learns that it is not authorized, not
 *  which half of the proof was wrong. */
export class RealtimeVoiceAuthorizationError extends Error {
  constructor() {
    super("The live voice session is not authorized for that thread.")
    this.name = "RealtimeVoiceAuthorizationError"
  }
}

export interface RealtimeVoiceRouteOptions {
  /** The shared web↔Eve binding secret (`SIGIL_AGENT_BINDING_SECRET`). */
  bindingSecret?: string
  /**
   * Server-side resource-scope authorization. Defaults to the same
   * `requireAuthorizedResourceScope` path every Eve request runs through;
   * tests inject it with a policy so the real proof verification runs without
   * opening the container registries.
   */
  authorizeResourceScope?: (input: {
    principalId: string
    request: Request
  }) => string | undefined
  /**
   * Build the per-session coordinator launch plan from the verified bound
   * thread (VOX.6.1). Called only AFTER both proofs pass, so a plan is never
   * built for an unauthorized offer. Returning undefined keeps the
   * containment-only default — the correct secure behaviour when the
   * coordinator surface cannot be wired (no binding secret, unresolved scope,
   * or no delegated grant). It never widens what the offer already authorized.
   */
  planSession?: (input: {
    binding: AgentSessionBindingPayload
    principalId: string
  }) => Promise<RealtimeVoiceSessionPlan | undefined>
  now?: () => number
}

/**
 * Reconstruct the bound application thread from the signed binding the web
 * server minted — the same proof and the same reader Eve's session routes use
 * (`eve-session-binding.ts` wraps it for `/eve/v1/session`, which is path-gated
 * and carries Eve-session semantics this route has no business asserting).
 *
 * The browser's `applicationThreadId` is only ever a claim; it is accepted
 * because the signature says so, and refused otherwise.
 */
function requireBoundApplicationThread(input: {
  applicationThreadId: string
  now: number
  principalId: string
  request: Request
  secret: string | undefined
}): AgentSessionBindingPayload {
  const proof = input.request.headers.get(AGENT_SESSION_BINDING_HEADER)?.trim()
  const secret = input.secret?.trim()
  const binding =
    proof && secret
      ? readAgentSessionBinding(proof, input.now, secret)
      : undefined
  if (
    !binding ||
    binding.subject !== input.principalId ||
    binding.applicationThreadId !== input.applicationThreadId
  ) {
    throw new RealtimeVoiceAuthorizationError()
  }
  return binding
}

/**
 * The caller is authorized for this thread's resource scope right now — not
 * merely in possession of a binding minted at some point. The signed binding
 * says which thread; this says the principal may still act in it.
 */
function requireAuthorizedVoiceScope(input: {
  applicationThreadId: string
  authorize: NonNullable<RealtimeVoiceRouteOptions["authorizeResourceScope"]>
  principalId: string
  request: Request
}): string {
  let scope: string | undefined
  try {
    scope = input.authorize({
      principalId: input.principalId,
      request: input.request,
    })
  } catch {
    throw new RealtimeVoiceAuthorizationError()
  }
  if (scope !== voiceResourceScope(input.applicationThreadId)) {
    throw new RealtimeVoiceAuthorizationError()
  }
  return scope
}

export function createRealtimeVoiceRoutes(
  authenticate: AuthFn<Request>,
  host: RealtimeVoiceHost,
  options: RealtimeVoiceRouteOptions = {},
): HttpRouteDefinition[] {
  const now = options.now ?? (() => Math.floor(Date.now() / 1_000))
  const authorizeResourceScope =
    options.authorizeResourceScope ??
    (({ principalId, request }) =>
      requireAuthorizedResourceScope({
        action: "tool",
        principalId,
        request,
        secret: options.bindingSecret,
      }))

  return [
    POST(REALTIME_OFFER_PATH, async (request) => {
      const principal = await authenticate(request)
      if (!principal) return errorResponse(401, "unauthorized")

      const body = await readJsonBody(request)
      const offerSdp = stringField(body, "offerSdp")
      if (!offerSdp) return errorResponse(400, "An offer SDP is required.")
      const applicationThreadId = stringField(body, "applicationThreadId")
      if (!applicationThreadId) {
        return errorResponse(
          400,
          "An application thread id is required — live voice binds to a conversation.",
        )
      }

      let binding: AgentSessionBindingPayload
      try {
        // Both proofs before the process: an unauthorized offer must not spawn
        // codex, and must not be distinguishable from any other refusal.
        binding = requireBoundApplicationThread({
          applicationThreadId,
          now: now(),
          principalId: principal.principalId,
          request,
          secret: options.bindingSecret,
        })
        requireAuthorizedVoiceScope({
          applicationThreadId,
          authorize: authorizeResourceScope,
          principalId: principal.principalId,
          request,
        })
      } catch (error) {
        if (error instanceof RealtimeVoiceAuthorizationError) {
          return errorResponse(403, error.message)
        }
        throw error
      }

      try {
        // Built only now, from the verified binding — never from the browser's
        // claim. Undefined keeps the containment-only default.
        const plan = await options.planSession?.({
          binding,
          principalId: principal.principalId,
        })
        const { threadId, answerSdp } = await host.start(
          { applicationThreadId, principalId: principal.principalId },
          offerSdp,
          plan,
        )
        return jsonResponse(200, { threadId, answerSdp, applicationThreadId })
      } catch (error) {
        if (
          error instanceof RealtimeVoiceConflictError ||
          // Nobody is waiting on this response — the caller hung up — but the
          // status has to say "this offer produced no session" so a retry or a
          // log is not read as a live call.
          error instanceof RealtimeVoiceCancelledError
        ) {
          return errorResponse(409, error.message)
        }
        // Backend and entitlement refusals arrive as app-server errors and are
        // the whole reason the browser needs a message rather than a code:
        // "Voice session access denied" is actionable, 502 is not.
        if (error instanceof RealtimeAppServerError) {
          return errorResponse(502, error.message)
        }
        return errorResponse(502, "Live voice is unavailable.")
      }
    }),
    // Stop names the thread it means. The principal comes from the verified
    // bearer and stays half the ownership key, so a wrong or stale thread id
    // ends nothing rather than ending the wrong call — no signed binding is
    // required here precisely because the id selects among the caller's own
    // calls instead of asserting an identity.
    POST(REALTIME_STOP_PATH, async (request) => {
      const principal = await authenticate(request)
      if (!principal) return errorResponse(401, "unauthorized")
      const applicationThreadId = stringField(
        await readJsonBody(request),
        "applicationThreadId",
      )
      if (!applicationThreadId) {
        return errorResponse(400, "An application thread id is required.")
      }
      const stopped = await host
        .stop({ applicationThreadId, principalId: principal.principalId })
        .catch(() => false)
      return jsonResponse(200, { stopped, applicationThreadId })
    }),
  ]
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

function stringField(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined
  const value = (body as Record<string, unknown>)[key]
  return typeof value === "string" && value.trim() ? value : undefined
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  })
}

function errorResponse(status: number, error: string): Response {
  return jsonResponse(status, { error })
}
