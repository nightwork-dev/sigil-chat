// The web server's half of the SDP relay: browser -> here -> Eve -> Codex.
//
// The browser never talks to Eve directly, because talking to Eve means
// holding an Eve bearer token, and a token in the browser is a token that
// leaves the deployment. So the offer arrives here on a session cookie, this
// module mints the service token it already mints for the catalog and
// readiness probes, and the answer comes back. Same authenticated pattern as
// `agent-catalog.ts` and `system-status.server.ts` — no new auth mechanism.
//
// P1 (LIVE-VOICE-HARNESS-ASSESSMENT) added the second half of that pattern:
// a call is bound to one application thread, and Eve verifies that binding
// rather than believing the browser. So this module mints exactly the two
// proofs a text turn mints — `getAgentSessionBindingProof` and
// `getAgentScopeProof`, with their existing thread-ownership and scope
// authorization checks — and sends them as the same headers text chat uses.
// The browser supplies a thread id; it never supplies identity.
//
// Degrade contract: every failure past authentication becomes an
// `{ error }` result, never a thrown exception, so the live-voice control can
// render the real message and the text composer keeps working beside it.

import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import {
  joinRuntimeUrl,
  readRuntimeTopology,
} from "@workspace/runtime-env/topology"

import { AGENT_SCOPE_HEADER, sessionResourceScope } from "./agent-session-scope"
import type { SigilAuthSession } from "./auth/server"

export const REALTIME_OFFER_PATH = "/sigil/v1/realtime/offer"
export const REALTIME_STOP_PATH = "/sigil/v1/realtime/stop"

export interface RealtimeOfferRequest {
  readonly offerSdp: string
  /** The Sigil application thread this call belongs to. */
  readonly applicationThreadId: string
}

export type RealtimeOfferResult =
  | {
      readonly threadId: string
      readonly answerSdp: string
      /** Echoed back by Eve only when it verified the binding server-side.
       *  The UI may say "bound" only on the strength of this field. */
      readonly boundApplicationThreadId: string
    }
  | { readonly error: string }

/** The proofs a bound call travels with — the same pair every text turn in
 *  this thread carries, minted through the same authorized issuers. */
export interface RealtimeThreadProof {
  readonly resourceScope: string
  readonly scopeProof: string
  readonly sessionBindingProof: string
}

export interface RealtimeRelayDependencies {
  readonly eveOrigin: string
  readonly getEveToken: () => Promise<string>
  readonly fetcher: typeof fetch
  readonly proveThread: (
    applicationThreadId: string,
  ) => Promise<RealtimeThreadProof>
}

const UNAVAILABLE = "Live voice is unavailable right now."
const UNBOUND = "Live voice needs an open conversation to bind to."
const UNAUTHORIZED = "This conversation is not available for live voice."

export async function exchangeRealtimeOffer(
  request: RealtimeOfferRequest,
  dependencies: RealtimeRelayDependencies = defaultDependencies(),
): Promise<RealtimeOfferResult> {
  if (!request.offerSdp.trim()) return { error: "No offer to send." }
  const applicationThreadId = request.applicationThreadId.trim()
  if (!applicationThreadId) return { error: UNBOUND }

  let proof: RealtimeThreadProof
  try {
    proof = await dependencies.proveThread(applicationThreadId)
  } catch {
    // The thread is not this principal's, or its scope is no longer
    // authorized. Either way no offer is worth sending.
    return { error: UNAUTHORIZED }
  }

  let response: Response
  try {
    response = await dependencies.fetcher(
      joinRuntimeUrl(dependencies.eveOrigin, REALTIME_OFFER_PATH),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${await dependencies.getEveToken()}`,
          "content-type": "application/json",
          [AGENT_SESSION_BINDING_HEADER]: proof.sessionBindingProof,
          [AGENT_SCOPE_HEADER]: proof.resourceScope,
          [AGENT_SCOPE_PROOF_HEADER]: proof.scopeProof,
        },
        body: JSON.stringify({
          offerSdp: request.offerSdp,
          applicationThreadId,
        }),
      },
    )
  } catch {
    return { error: UNAVAILABLE }
  }

  const payload = await readJson(response)
  if (!response.ok) {
    // Eve's message is the point of this path: an entitlement refusal, a
    // conflict that names the thread already holding voice, or a missing codex
    // binary all tell the user what to do; "502" does not.
    return { error: messageOf(payload) ?? UNAVAILABLE }
  }
  const threadId = stringOf(payload, "threadId")
  const answerSdp = stringOf(payload, "answerSdp")
  if (!threadId || !answerSdp) {
    return { error: "Live voice returned an unusable answer." }
  }
  if (stringOf(payload, "applicationThreadId") !== applicationThreadId) {
    // Eve answered without confirming the binding, or confirmed a different
    // one. A call whose thread we cannot name is exactly the state the UI has
    // been overstating; refuse it rather than show it as bound.
    return { error: "Live voice did not confirm the conversation binding." }
  }
  return { threadId, answerSdp, boundApplicationThreadId: applicationThreadId }
}

/** Best-effort teardown. The browser closes its own peer connection either
 *  way, so a failed stop is never worth an error state — but the host must
 *  still be told, or its codex process outlives the call. The thread id says
 *  WHICH call: the host will not end one bound to another conversation. */
export async function requestRealtimeStop(
  applicationThreadId: string,
  dependencies: RealtimeRelayDependencies = defaultDependencies(),
): Promise<boolean> {
  const threadId = applicationThreadId.trim()
  if (!threadId) return false
  try {
    const response = await dependencies.fetcher(
      joinRuntimeUrl(dependencies.eveOrigin, REALTIME_STOP_PATH),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${await dependencies.getEveToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ applicationThreadId: threadId }),
      },
    )
    if (!response.ok) return false
    const payload = await readJson(response)
    return (payload as { stopped?: unknown } | undefined)?.stopped === true
  } catch {
    return false
  }
}

function defaultDependencies(): RealtimeRelayDependencies {
  return {
    eveOrigin: readRuntimeTopology(process.env).eveOrigin,
    getEveToken: async () => {
      const { getEveBearerToken } = await import("./auth/session")
      return getEveBearerToken()
    },
    fetcher: fetch,
    proveThread: async (applicationThreadId) => {
      const { getSession, requireSession } = await import("./auth/session")
      const { getAgentSessionBindingProof } =
        await import("./agent-session-binding")
      const { getAgentScopeProof } = await import("./agent-scope-delegation")
      const session = await getSession()
      // TypeScript requires an explicitly annotated binding to use an
      // assertion function reached through a dynamic import (same shape as
      // `agent-session-binding.ts`).
      const assertSession: (
        candidate: SigilAuthSession | null,
      ) => asserts candidate is SigilAuthSession = requireSession
      assertSession(session)
      const resourceScope = sessionResourceScope(applicationThreadId)
      const [sessionBindingProof, scopeProof] = await Promise.all([
        getAgentSessionBindingProof(applicationThreadId, session.user.id),
        getAgentScopeProof(resourceScope, session.user.id),
      ])
      return { resourceScope, scopeProof, sessionBindingProof }
    },
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function messageOf(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined
  const error = (payload as { error?: unknown }).error
  return typeof error === "string" && error.trim() ? error : undefined
}

function stringOf(payload: unknown, key: string): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === "string" && value.trim() ? value : undefined
}
