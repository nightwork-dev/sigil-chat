// One live voice call, negotiated: microphone, peer connection, offer,
// answer, remote audio, and the promise that all of it is released again.
//
// The WebRTC handshake never touches our servers with media — they relay two
// SDP strings and nothing else (spec, "The no-API-key path"), so audio flows
// browser <-> OpenAI directly and no credential reaches either end of this
// module. What lives here is the ORDER of the handshake and its cleanup, which
// is the part that can actually be got wrong.
//
// Every browser primitive is injected. `navigator.mediaDevices`,
// `RTCPeerConnection`, and the playback element are the defaults; tests pass
// fakes and exercise the whole flow — including each failure path — without a
// browser. That is also why the media types below are the narrow shapes this
// module uses rather than the full DOM interfaces.

import { createServerFn } from "@tanstack/react-start"

import { createCaptureLifecycle, type MediaTrackLike } from "./capture-lifecycle"

/** The data channel OpenAI's realtime API expects on a WebRTC call. */
export const REALTIME_EVENT_CHANNEL = "oai-events"

export class RealtimeVoiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RealtimeVoiceError"
  }
}

export const MICROPHONE_FAILED =
  "Microphone unavailable — check browser permission."

export interface RealtimeMediaStreamLike {
  getTracks(): readonly MediaTrackLike[]
}

export interface RealtimeDataChannelLike {
  readonly label: string
  close?(): void
}

export interface RealtimeSessionDescription {
  readonly type: string
  readonly sdp?: string
}

export interface RealtimeTrackEvent {
  readonly streams: readonly RealtimeMediaStreamLike[]
}

export interface RealtimePeerConnectionLike {
  ontrack: ((event: RealtimeTrackEvent) => void) | null
  addTrack(track: MediaTrackLike, stream: RealtimeMediaStreamLike): unknown
  createDataChannel(label: string): RealtimeDataChannelLike
  createOffer(): Promise<RealtimeSessionDescription>
  setLocalDescription(description: RealtimeSessionDescription): Promise<void>
  setRemoteDescription(description: RealtimeSessionDescription): Promise<void>
  close(): void
}

/** Where the agent's voice comes out. Kept behind this two-method shape so
 *  the negotiation never holds an `<audio>` element or an AudioContext
 *  directly, and so the audio-focus manager has something to pause. */
export interface RealtimeAudioSink {
  play(stream: RealtimeMediaStreamLike): void
  stop(): void
}

export interface RealtimeVoicePrimitives {
  getMicrophone(): Promise<RealtimeMediaStreamLike>
  createPeerConnection(): RealtimePeerConnectionLike
  createAudioSink(): RealtimeAudioSink
  /** Post the offer through our own server and get the answer back. */
  exchange(offerSdp: string): Promise<RealtimeOfferExchange>
  /** Tell the host the call is over. Best effort — never blocks teardown. */
  endSession?(): Promise<unknown>
  /** Cancels a negotiation already in flight. */
  signal?: AbortSignal
  /** Fired once remote audio is actually playing, so the caller can register
   *  playback with the audio-focus manager. */
  onRemoteAudio?(sink: RealtimeAudioSink): void
}

export type RealtimeOfferExchange =
  | { readonly threadId: string; readonly answerSdp: string }
  | { readonly error: string }

export interface RealtimeVoiceSession {
  readonly threadId: string
  /** Idempotent. Stops the microphone, closes the peer connection, releases
   *  playback, and tells the host to end the realtime session. */
  readonly stop: () => void
}

/**
 * Negotiate a call. Resolves only when remote description is applied and the
 * session is genuinely live; on any failure it releases everything it opened
 * and throws a `RealtimeVoiceError` whose message is fit to show the user.
 */
export async function startRealtimeVoiceSession(
  primitives: RealtimeVoicePrimitives,
): Promise<RealtimeVoiceSession> {
  let microphone: RealtimeMediaStreamLike
  try {
    microphone = await primitives.getMicrophone()
  } catch {
    // Nothing was opened yet, so there is nothing to release — but the caller
    // still needs the microphone-specific message rather than a generic one.
    throw new RealtimeVoiceError(MICROPHONE_FAILED)
  }

  const lifecycle = createCaptureLifecycle({ tracks: microphone.getTracks() })
  const peer = primitives.createPeerConnection()
  const sink = primitives.createAudioSink()
  let released = false
  let stopped = false

  const release = (): void => {
    if (released) return
    released = true
    lifecycle.stop()
    sink.stop()
    peer.close()
  }

  const stop = (): void => {
    if (stopped) return
    stopped = true
    release()
    // The host owns a codex process for this call; failing to tell it would
    // leave that process alive with nobody on the other end.
    void primitives.endSession?.()
  }

  const abort = (): void => stop()
  primitives.signal?.addEventListener("abort", abort, { once: true })

  try {
    if (primitives.signal?.aborted) {
      throw new RealtimeVoiceError("Live voice was cancelled.")
    }

    peer.ontrack = (event) => {
      const stream = event.streams[0]
      if (!stream) return
      sink.play(stream)
      primitives.onRemoteAudio?.(sink)
    }
    for (const track of microphone.getTracks()) {
      peer.addTrack(track, microphone)
    }
    // The realtime API delivers its events over this channel; it has to exist
    // on the offer, before the SDP is created, or the answer has no place to
    // put them.
    peer.createDataChannel(REALTIME_EVENT_CHANNEL)

    const offer = await peer.createOffer()
    if (!offer.sdp) {
      throw new RealtimeVoiceError("The browser produced no offer to send.")
    }
    await peer.setLocalDescription(offer)

    const exchange = await primitives.exchange(offer.sdp)
    if ("error" in exchange) throw new RealtimeVoiceError(exchange.error)
    // A stop that landed while the offer was in flight must win: the session
    // the user already ended does not come up live behind them.
    if (stopped || primitives.signal?.aborted) {
      throw new RealtimeVoiceError("Live voice was cancelled.")
    }

    await peer.setRemoteDescription({
      type: "answer",
      sdp: exchange.answerSdp,
    })

    return { threadId: exchange.threadId, stop }
  } catch (error) {
    stop()
    throw error instanceof RealtimeVoiceError
      ? error
      : new RealtimeVoiceError(
          error instanceof Error ? error.message : "Live voice failed.",
        )
  } finally {
    primitives.signal?.removeEventListener("abort", abort)
  }
}

const exchangeRealtimeOfferFn = createServerFn({ method: "POST" })
  .validator((offerSdp: string) => offerSdp)
  .handler(async ({ data }): Promise<RealtimeOfferExchange> => {
    const { exchangeRealtimeOffer } = await import("./voice-realtime.server")
    return exchangeRealtimeOffer(data)
  })

const stopRealtimeVoiceFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<boolean> => {
    const { requestRealtimeStop } = await import("./voice-realtime.server")
    return requestRealtimeStop()
  },
)

/** The browser's exchange step: same-origin, session-cookie authenticated,
 *  and it never sees the Eve service token that the server side uses. */
export function exchangeRealtimeOfferFromBrowser(
  offerSdp: string,
): Promise<RealtimeOfferExchange> {
  return exchangeRealtimeOfferFn({ data: offerSdp }).catch(() => ({
    error: "Live voice is unavailable right now.",
  }))
}

export function endRealtimeVoiceFromBrowser(): Promise<boolean> {
  return stopRealtimeVoiceFn().catch(() => false)
}

/** Real microphone capture. Only reachable in a browser. */
export function browserMicrophone(): Promise<RealtimeMediaStreamLike> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  }) as unknown as Promise<RealtimeMediaStreamLike>
}

export function browserPeerConnection(): RealtimePeerConnectionLike {
  return new RTCPeerConnection() as unknown as RealtimePeerConnectionLike
}

/**
 * Playback through a detached `<audio>` element: the agent's voice needs no
 * visible player (the control already says a call is live), and an element
 * we own is the one thing the audio-focus manager can reliably pause.
 */
export function browserAudioSink(): RealtimeAudioSink {
  const element = new Audio()
  element.autoplay = true
  return {
    play(stream) {
      element.srcObject = stream as unknown as MediaStream
      void element.play().catch(() => {})
    },
    stop() {
      element.pause()
      element.srcObject = null
    },
  }
}
