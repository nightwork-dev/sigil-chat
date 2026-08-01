// The negotiation, exercised against fake media primitives.
//
// Two properties are load-bearing and both are checked by falsification below:
// the offer the browser sends carries the microphone track AND the oai-events
// channel, and every exit path — refused microphone, failed offer, host
// refusal, cancellation, ordinary stop — releases the microphone and closes
// the peer connection. A negotiation that half-cleans up looks identical from
// the outside until the mic indicator stays lit.

import { describe, expect, it, vi } from "vitest"

import {
  MICROPHONE_FAILED,
  REALTIME_EVENT_CHANNEL,
  RealtimeVoiceError,
  startRealtimeVoiceSession,
  type RealtimeMediaStreamLike,
  type RealtimeOfferExchange,
  type RealtimePeerConnectionLike,
  type RealtimeVoicePrimitives,
} from "./voice-realtime"

const OFFER_SDP = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
const ANSWER_SDP = "v=0\r\na=ice-lite\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"

function fakeMicrophone() {
  let stops = 0
  const track = {
    stop: () => {
      stops += 1
    },
  }
  const stream: RealtimeMediaStreamLike = { getTracks: () => [track] }
  return { stream, track, stopped: () => stops }
}

function fakePeer(
  behavior: { offerSdp?: string | undefined; failOffer?: Error } = {},
) {
  const added: unknown[] = []
  const channels: string[] = []
  const local: unknown[] = []
  const remote: unknown[] = []
  let closes = 0
  const peer: RealtimePeerConnectionLike = {
    ontrack: null,
    addTrack(track) {
      added.push(track)
    },
    createDataChannel(label) {
      channels.push(label)
      return { label }
    },
    async createOffer() {
      if (behavior.failOffer) throw behavior.failOffer
      return {
        type: "offer",
        sdp: "offerSdp" in behavior ? behavior.offerSdp : OFFER_SDP,
      }
    },
    async setLocalDescription(description) {
      local.push(description)
    },
    async setRemoteDescription(description) {
      remote.push(description)
    },
    close() {
      closes += 1
    },
  }
  return { peer, added, channels, local, remote, closed: () => closes }
}

function fakeSink() {
  const played: RealtimeMediaStreamLike[] = []
  let stops = 0
  return {
    sink: {
      play: (stream: RealtimeMediaStreamLike) => {
        played.push(stream)
      },
      stop: () => {
        stops += 1
      },
    },
    played,
    stopped: () => stops,
  }
}

interface Harness {
  primitives: RealtimeVoicePrimitives
  microphone: ReturnType<typeof fakeMicrophone>
  peer: ReturnType<typeof fakePeer>
  sink: ReturnType<typeof fakeSink>
  ended: () => number
}

function harness(
  options: {
    exchange?: (offerSdp: string) => Promise<RealtimeOfferExchange>
    peerBehavior?: Parameters<typeof fakePeer>[0]
    microphoneFails?: boolean
    signal?: AbortSignal
    onRemoteAudio?: RealtimeVoicePrimitives["onRemoteAudio"]
  } = {},
): Harness {
  const microphone = fakeMicrophone()
  const peer = fakePeer(options.peerBehavior)
  const sink = fakeSink()
  let ends = 0
  return {
    microphone,
    peer,
    sink,
    ended: () => ends,
    primitives: {
      getMicrophone: options.microphoneFails
        ? () => Promise.reject(new Error("NotAllowedError"))
        : () => Promise.resolve(microphone.stream),
      createPeerConnection: () => peer.peer,
      createAudioSink: () => sink.sink,
      exchange:
        options.exchange ??
        (() =>
          Promise.resolve({ threadId: "thread-1", answerSdp: ANSWER_SDP })),
      endSession: () => {
        ends += 1
        return Promise.resolve(true)
      },
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onRemoteAudio
        ? { onRemoteAudio: options.onRemoteAudio }
        : {}),
    },
  }
}

describe("the offer the browser builds", () => {
  it("carries the microphone track and the oai-events channel, then applies the answer", async () => {
    const test = harness()

    const session = await startRealtimeVoiceSession(test.primitives)

    expect(test.peer.added).toEqual([test.microphone.stream.getTracks()[0]])
    expect(test.peer.channels).toEqual([REALTIME_EVENT_CHANNEL])
    expect(test.peer.local).toEqual([{ type: "offer", sdp: OFFER_SDP }])
    expect(test.peer.remote).toEqual([{ type: "answer", sdp: ANSWER_SDP }])
    expect(session.threadId).toBe("thread-1")
  })

  it("sends the local offer's own SDP, not something reconstructed", async () => {
    const exchange = vi.fn(() =>
      Promise.resolve({ threadId: "thread-1", answerSdp: ANSWER_SDP }),
    )
    await startRealtimeVoiceSession(harness({ exchange }).primitives)

    expect(exchange).toHaveBeenCalledWith(OFFER_SDP)
  })

  it("plays remote audio and announces the sink for audio-focus registration", async () => {
    const registered: unknown[] = []
    const test = harness({ onRemoteAudio: (sink) => registered.push(sink) })
    await startRealtimeVoiceSession(test.primitives)

    const remoteStream: RealtimeMediaStreamLike = { getTracks: () => [] }
    test.peer.peer.ontrack?.({ streams: [remoteStream] })

    expect(test.sink.played).toEqual([remoteStream])
    expect(registered).toEqual([test.sink.sink])
  })
})

describe("the server's confirmation of the thread binding", () => {
  // P1: the UI may claim a call is bound to a conversation only on the
  // server's own word, so the confirmation has to survive the negotiation
  // rather than being reconstructed from what the browser asked for.
  it("carries the confirmed application thread through to the session", async () => {
    const test = harness({
      exchange: () =>
        Promise.resolve({
          threadId: "realtime-1",
          answerSdp: ANSWER_SDP,
          boundApplicationThreadId: "thread-42",
        }),
    })

    const session = await startRealtimeVoiceSession(test.primitives)

    expect(session.boundApplicationThreadId).toBe("thread-42")
  })

  it("leaves the session unconfirmed when the server did not say", async () => {
    const session = await startRealtimeVoiceSession(harness().primitives)

    expect(session.boundApplicationThreadId).toBeUndefined()
  })
})

describe("cleanup on every exit path", () => {
  it("a refused microphone opens no peer connection and reports the mic message", async () => {
    const test = harness({ microphoneFails: true })

    await expect(startRealtimeVoiceSession(test.primitives)).rejects.toThrow(
      MICROPHONE_FAILED,
    )
    expect(test.peer.closed()).toBe(0)
    expect(test.peer.added).toHaveLength(0)
  })

  it("a failed offer releases the microphone and closes the peer connection", async () => {
    const test = harness({
      peerBehavior: { failOffer: new Error("createOffer exploded") },
    })

    await expect(
      startRealtimeVoiceSession(test.primitives),
    ).rejects.toBeInstanceOf(RealtimeVoiceError)
    expect(test.microphone.stopped()).toBe(1)
    expect(test.peer.closed()).toBe(1)
    expect(test.sink.stopped()).toBe(1)
  })

  it("an offer with no SDP is a failure, not a silent no-op", async () => {
    const test = harness({ peerBehavior: { offerSdp: undefined } })

    await expect(startRealtimeVoiceSession(test.primitives)).rejects.toThrow(
      /no offer/i,
    )
    expect(test.microphone.stopped()).toBe(1)
    expect(test.peer.closed()).toBe(1)
  })

  it("a host refusal surfaces its message and releases everything", async () => {
    const test = harness({
      exchange: () => Promise.resolve({ error: "Voice session access denied" }),
    })

    await expect(startRealtimeVoiceSession(test.primitives)).rejects.toThrow(
      "Voice session access denied",
    )
    expect(test.microphone.stopped()).toBe(1)
    expect(test.peer.closed()).toBe(1)
    expect(test.sink.stopped()).toBe(1)
    // The host must be told even about a call that never came up, or its
    // codex process outlives a session the user never had.
    expect(test.ended()).toBe(1)
    // Nothing was applied as a remote description.
    expect(test.peer.remote).toHaveLength(0)
  })

  it("an ordinary stop releases the microphone, the peer, and the host session", async () => {
    const test = harness()
    const session = await startRealtimeVoiceSession(test.primitives)

    session.stop()

    expect(test.microphone.stopped()).toBe(1)
    expect(test.peer.closed()).toBe(1)
    expect(test.sink.stopped()).toBe(1)
    expect(test.ended()).toBe(1)
  })

  it("stopping twice releases once", async () => {
    const test = harness()
    const session = await startRealtimeVoiceSession(test.primitives)

    session.stop()
    session.stop()

    expect(test.microphone.stopped()).toBe(1)
    expect(test.peer.closed()).toBe(1)
    expect(test.ended()).toBe(1)
  })
})

describe("cancellation", () => {
  it("aborting mid-exchange releases the media and never comes up live", async () => {
    const controller = new AbortController()
    let releaseExchange: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseExchange = resolve
    })
    const test = harness({
      signal: controller.signal,
      exchange: async () => {
        await gate
        return { threadId: "thread-1", answerSdp: ANSWER_SDP }
      },
    })

    const pending = startRealtimeVoiceSession(test.primitives)
    controller.abort()
    releaseExchange!()

    await expect(pending).rejects.toThrow(/cancelled/i)
    expect(test.microphone.stopped()).toBe(1)
    expect(test.peer.closed()).toBe(1)
    // The answer was never applied — a call the user cancelled does not start.
    expect(test.peer.remote).toHaveLength(0)
    // And the host is told, so it can kill a negotiation still in flight
    // rather than bringing up a call with nobody attached.
    expect(test.ended()).toBe(1)
  })

  it("an already-aborted signal opens nothing", async () => {
    const test = harness({ signal: AbortSignal.abort() })

    await expect(startRealtimeVoiceSession(test.primitives)).rejects.toThrow(
      /cancelled/i,
    )
    expect(test.peer.channels).toHaveLength(0)
    expect(test.microphone.stopped()).toBe(1)
  })
})
