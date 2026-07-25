// The SDP relay: the browser's offer in, Codex's answer out, nothing else.
//
// D-1 gave us a JSON-RPC client that drives `codex app-server`'s realtime
// surface. This is the authenticated seam that lets the browser reach it. It
// deliberately relays two strings and no media: audio flows browser <-> OpenAI
// directly (spec, "The no-API-key path"), so this process never sees a
// credential, an audio frame, or an upstream call id.
//
// One live session per host. The D-1 client refuses a second concurrent start
// on one instance, which protects the client but says nothing about who may
// take the host — so instance lifecycle is explicit here: a live session
// belongs to the principal that started it, another principal is refused
// rather than displaced, and the same principal renegotiating (a reload, a
// second tab) replaces its own session after the old one is disposed.
//
// Everything below is injectable: `createClient` defaults to the real
// app-server client, and every test supplies a fake, so the whole relay —
// including the failure and conflict paths — runs without spawning codex.

import { POST, type HttpRouteDefinition } from "eve/channels"
import type { AuthFn } from "eve/channels/auth"

import {
  RealtimeAppServerClient,
  RealtimeAppServerError,
} from "./realtime-appserver"

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

interface LiveSession {
  client: RealtimeVoiceClient
  ownerId: string
  threadId: string
}

/**
 * Owns at most one realtime session and the client process behind it.
 */
export class RealtimeVoiceHost {
  #createClient: () => RealtimeVoiceClient
  #live: LiveSession | undefined
  /** A negotiation in flight. Held as the client itself, not just an owner id,
   *  because a caller that hangs up mid-negotiation has to be able to kill the
   *  process behind it — and starting a realtime session is SLOW (codex emits
   *  its whole MCP startup sequence first), so cancel-during-connect is the
   *  ordinary path, not the rare one. */
  #pending: { ownerId: string; client: RealtimeVoiceClient } | undefined

  constructor(options: RealtimeVoiceHostOptions = {}) {
    this.#createClient = options.createClient ?? (() => new RealtimeAppServerClient())
  }

  get liveOwnerId(): string | undefined {
    return this.#live?.ownerId
  }

  async start(
    ownerId: string,
    offerSdp: string,
  ): Promise<RealtimeVoiceStartResult> {
    // A start in flight has no live session to compare against yet, so the
    // conflict check has to consult it too — otherwise two simultaneous
    // requests both pass the guard and the second one strands the first's
    // codex process with nobody holding a handle to dispose it.
    const holder = this.#live?.ownerId ?? this.#pending?.ownerId
    if (holder !== undefined && holder !== ownerId) {
      throw new RealtimeVoiceConflictError(
        "Another live voice session is already running on this host.",
      )
    }
    // The same principal renegotiating replaces its own session: tear the old
    // one down completely first, so the replacement is never the second start
    // on a client that already holds one.
    this.#disposeLive("Replaced by a new live voice session.")

    const client = this.#createClient()
    this.#pending = { ownerId, client }
    try {
      const result = await client.start(offerSdp, {
        prompt: REALTIME_BOUNDARY_CONTEXT,
      })
      // A stop that landed while this was negotiating already disposed the
      // client and cleared the slot. Publishing the session now would hand the
      // host a live call nobody is attached to.
      if (this.#pending?.client !== client) {
        throw new RealtimeVoiceCancelledError(
          "The live voice session was cancelled before it came up.",
        )
      }
      this.#live = { client, ownerId, threadId: result.threadId }
      return result
    } catch (error) {
      // A failed start leaves a spawned child behind unless we say otherwise.
      // Dispose is idempotent, so the cancelled path disposing twice is safe.
      client.dispose("The live voice session failed to start.")
      throw error
    } finally {
      if (this.#pending?.client === client) this.#pending = undefined
    }
  }

  /** End the caller's own session. Another principal's session is never
   *  touched — reporting "nothing live" to a caller that owns nothing is the
   *  honest answer, and it is idempotent for the browser's cleanup path. */
  async stop(ownerId: string): Promise<boolean> {
    // Hanging up during the connect wait is the common case, not an edge: the
    // caller has nothing to show for it yet, and the only way to honour that
    // is to kill the negotiation rather than let it come up orphaned.
    const pending = this.#pending
    if (pending && pending.ownerId === ownerId) {
      this.#pending = undefined
      pending.client.dispose(
        "The live voice session was cancelled before it came up.",
      )
      return true
    }

    const live = this.#live
    if (!live || live.ownerId !== ownerId) return false
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
  }
}

export function createRealtimeVoiceRoutes(
  authenticate: AuthFn<Request>,
  host: RealtimeVoiceHost,
): HttpRouteDefinition[] {
  return [
    POST(REALTIME_OFFER_PATH, async (request) => {
      const principal = await authenticate(request)
      if (!principal) return errorResponse(401, "unauthorized")

      const offerSdp = await readOfferSdp(request)
      if (!offerSdp) return errorResponse(400, "An offer SDP is required.")

      try {
        const { threadId, answerSdp } = await host.start(
          principal.principalId,
          offerSdp,
        )
        return jsonResponse(200, { threadId, answerSdp })
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
    POST(REALTIME_STOP_PATH, async (request) => {
      const principal = await authenticate(request)
      if (!principal) return errorResponse(401, "unauthorized")
      const stopped = await host.stop(principal.principalId).catch(() => false)
      return jsonResponse(200, { stopped })
    }),
  ]
}

async function readOfferSdp(request: Request): Promise<string | undefined> {
  try {
    const body: unknown = await request.json()
    if (typeof body !== "object" || body === null) return undefined
    const offerSdp = (body as { offerSdp?: unknown }).offerSdp
    return typeof offerSdp === "string" && offerSdp.trim() ? offerSdp : undefined
  } catch {
    return undefined
  }
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
