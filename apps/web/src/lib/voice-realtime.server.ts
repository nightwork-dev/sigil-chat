// The web server's half of the SDP relay: browser -> here -> Eve -> Codex.
//
// The browser never talks to Eve directly, because talking to Eve means
// holding an Eve bearer token, and a token in the browser is a token that
// leaves the deployment. So the offer arrives here on a session cookie, this
// module mints the service token it already mints for the catalog and
// readiness probes, and the answer comes back. Same authenticated pattern as
// `agent-catalog.ts` and `system-status.server.ts` — no new auth mechanism.
//
// Degrade contract: every failure past authentication becomes an
// `{ error }` result, never a thrown exception, so the live-voice control can
// render the real message and the text composer keeps working beside it.

import {
  joinRuntimeUrl,
  readRuntimeTopology,
} from "@workspace/runtime-env/topology"

export const REALTIME_OFFER_PATH = "/sigil/v1/realtime/offer"
export const REALTIME_STOP_PATH = "/sigil/v1/realtime/stop"

export type RealtimeOfferResult =
  | { readonly threadId: string; readonly answerSdp: string }
  | { readonly error: string }

export interface RealtimeRelayDependencies {
  readonly eveOrigin: string
  readonly getEveToken: () => Promise<string>
  readonly fetcher: typeof fetch
}

const UNAVAILABLE = "Live voice is unavailable right now."

export async function exchangeRealtimeOffer(
  offerSdp: string,
  dependencies: RealtimeRelayDependencies = defaultDependencies(),
): Promise<RealtimeOfferResult> {
  if (!offerSdp.trim()) return { error: "No offer to send." }

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
        },
        body: JSON.stringify({ offerSdp }),
      },
    )
  } catch {
    return { error: UNAVAILABLE }
  }

  const payload = await readJson(response)
  if (!response.ok) {
    // Eve's message is the point of this path: an entitlement refusal or a
    // missing codex binary tells the user what to do; "502" does not.
    return { error: messageOf(payload) ?? UNAVAILABLE }
  }
  const threadId = stringOf(payload, "threadId")
  const answerSdp = stringOf(payload, "answerSdp")
  if (!threadId || !answerSdp) {
    return { error: "Live voice returned an unusable answer." }
  }
  return { threadId, answerSdp }
}

/** Best-effort teardown. The browser closes its own peer connection either
 *  way, so a failed stop is never worth an error state — but the host must
 *  still be told, or its codex process outlives the call. */
export async function requestRealtimeStop(
  dependencies: RealtimeRelayDependencies = defaultDependencies(),
): Promise<boolean> {
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
        body: "{}",
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
