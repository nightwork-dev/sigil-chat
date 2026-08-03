// The browser's half of the realtime offer/answer exchange: same-origin,
// session-cookie authenticated TanStack server functions.
//
// The negotiation ORDER (microphone, peer connection, offer, answer, cleanup
// on every exit path) is product-neutral and lives upstream now in
// @zigil/agent/voice (`startRealtimeVoiceSession` and the browser
// primitives) — import those directly rather than through this module. What
// stays here is Chat-specific: routing the offer through our own server
// function, which never exposes the Eve service token or the upstream URL
// to the browser — the thread id is the browser's only contribution to the
// binding, and the proofs that make it authoritative are minted server-side
// (voice-realtime.server.ts).

import { createServerFn } from "@tanstack/react-start"

import type { RealtimeOfferExchange } from "@zigil/agent/voice"

interface RealtimeOfferInput {
  offerSdp: string
  applicationThreadId: string
}

const exchangeRealtimeOfferFn = createServerFn({ method: "POST" })
  .validator((input: RealtimeOfferInput) => input)
  .handler(async ({ data }): Promise<RealtimeOfferExchange> => {
    const { exchangeRealtimeOffer } = await import("./voice-realtime.server")
    return exchangeRealtimeOffer(data)
  })

const stopRealtimeVoiceFn = createServerFn({ method: "POST" })
  .validator((applicationThreadId: string) => applicationThreadId)
  .handler(async ({ data }): Promise<boolean> => {
    const { requestRealtimeStop } = await import("./voice-realtime.server")
    return requestRealtimeStop(data)
  })

/** The browser's exchange step: same-origin, session-cookie authenticated,
 *  and it never sees the Eve service token that the server side uses. The
 *  thread id is the browser's only contribution to the binding — the proofs
 *  that make it authoritative are minted on the server. */
export function exchangeRealtimeOfferFromBrowser(
  offerSdp: string,
  applicationThreadId: string,
): Promise<RealtimeOfferExchange> {
  return exchangeRealtimeOfferFn({
    data: { offerSdp, applicationThreadId },
  }).catch(() => ({
    error: "Live voice is unavailable right now.",
  }))
}

export function endRealtimeVoiceFromBrowser(
  applicationThreadId: string,
): Promise<boolean> {
  return stopRealtimeVoiceFn({ data: applicationThreadId }).catch(() => false)
}
