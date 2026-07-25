// @vitest-environment jsdom
//
// D-2: activating a live call from the composer, and the promise that the
// text chat is untouched by whatever the call does.
//
// The media primitives are injected, so the real negotiation runs end to end
// here — offer, exchange, answer, cleanup — without getUserMedia or
// RTCPeerConnection. What this file adds over the negotiation unit tests is
// the wiring: the control's states, the thread binding, the audio-focus
// handshake with dictation, and the degrade contract.

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { createAudioFocusManager } from "@/lib/audio-focus"
import {
  createVoiceSessionStore,
  type VoiceSessionStore,
} from "@/lib/voice-session-binding"
import type {
  RealtimeMediaStreamLike,
  RealtimeOfferExchange,
  RealtimePeerConnectionLike,
  RealtimeVoicePrimitives,
} from "@/lib/voice-realtime"

import { LiveVoiceComposerControl } from "./live-voice-composer-control"

beforeAll(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

let host: HTMLDivElement | null = null
let root: Root | null = null

function render(element: React.ReactElement): HTMLElement {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(element))
  return host
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  host?.remove()
  root = null
  host = null
})

const THREAD = {
  threadId: "thread-1",
  threadSlug: "ab12cd34",
  title: "Pricing review",
}

const ANSWER_SDP = "v=0\r\na=ice-lite\r\n"

function fakePrimitives(
  options: {
    exchange?: (offerSdp: string) => Promise<RealtimeOfferExchange>
    microphoneFails?: boolean
  } = {},
) {
  let trackStops = 0
  let peerCloses = 0
  let ends = 0
  const track = {
    stop: () => {
      trackStops += 1
    },
  }
  const stream: RealtimeMediaStreamLike = { getTracks: () => [track] }
  const peer: RealtimePeerConnectionLike = {
    ontrack: null,
    addTrack: () => {},
    createDataChannel: (label) => ({ label }),
    createOffer: async () => ({ type: "offer", sdp: "offer-sdp" }),
    setLocalDescription: async () => {},
    setRemoteDescription: async () => {},
    close: () => {
      peerCloses += 1
    },
  }
  const sink = { play: () => {}, stop: () => {} }
  const primitives: Partial<RealtimeVoicePrimitives> = {
    getMicrophone: options.microphoneFails
      ? () => Promise.reject(new Error("NotAllowedError"))
      : () => Promise.resolve(stream),
    createPeerConnection: () => peer,
    createAudioSink: () => sink,
    exchange:
      options.exchange ??
      (() => Promise.resolve({ threadId: "thread-1", answerSdp: ANSWER_SDP })),
    endSession: () => {
      ends += 1
      return Promise.resolve(true)
    },
  }
  return {
    primitives,
    peer,
    sink,
    microphoneStopped: () => trackStops,
    peerClosed: () => peerCloses,
    ended: () => ends,
  }
}

function control(el: HTMLElement): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>(
    "button[data-live-voice-state]",
  )
  if (!button) throw new Error("live voice control did not render")
  return button
}

function state(el: HTMLElement): string | undefined {
  return control(el).dataset.liveVoiceState
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    control(el).click()
  })
}

function mount(
  options: {
    primitives?: Partial<RealtimeVoicePrimitives>
    store?: VoiceSessionStore
    audioFocus?: ReturnType<typeof createAudioFocusManager>
    thread?: typeof THREAD | undefined
  } = {},
): HTMLElement {
  return render(
    <LiveVoiceComposerControl
      audioFocus={options.audioFocus ?? createAudioFocusManager()}
      primitives={options.primitives}
      store={options.store ?? createVoiceSessionStore()}
      thread={"thread" in options ? options.thread : THREAD}
    />,
  )
}

describe("activating a live call", () => {
  it("is explicit: nothing is live until the control is pressed", () => {
    const fake = fakePrimitives()
    const el = mount({ primitives: fake.primitives })

    expect(state(el)).toBe("idle")
    expect(control(el).getAttribute("aria-label")).toMatch(/start/i)
    expect(fake.microphoneStopped()).toBe(0)
  })

  it("goes live and offers ending the call as the same one action", async () => {
    const fake = fakePrimitives()
    const el = mount({ primitives: fake.primitives })

    await click(el)

    expect(state(el)).toBe("live")
    expect(control(el).dataset.liveVoiceAction).toBe("stop")
    expect(control(el).getAttribute("aria-pressed")).toBe("true")
  })

  it("ends the call, releasing the microphone and the host session", async () => {
    const fake = fakePrimitives()
    const el = mount({ primitives: fake.primitives })

    await click(el)
    await click(el)

    expect(state(el)).toBe("idle")
    expect(fake.microphoneStopped()).toBe(1)
    expect(fake.peerClosed()).toBe(1)
    expect(fake.ended()).toBe(1)
  })

  it("releases the call when the composer unmounts mid-call", async () => {
    const fake = fakePrimitives()
    const el = mount({ primitives: fake.primitives })
    await click(el)
    expect(state(el)).toBe("live")

    act(() => root!.unmount())
    root = null

    expect(fake.microphoneStopped()).toBe(1)
    expect(fake.peerClosed()).toBe(1)
    expect(fake.ended()).toBe(1)
  })
})

describe("failure is visible and text keeps working", () => {
  it("shows the host's own refusal message", async () => {
    const fake = fakePrimitives({
      exchange: () =>
        Promise.resolve({ error: "Voice session access denied" }),
    })
    const el = mount({ primitives: fake.primitives })

    await click(el)

    expect(state(el)).toBe("error")
    expect(el.textContent).toContain("Voice session access denied")
    // Nothing is held open behind the error state.
    expect(fake.microphoneStopped()).toBe(1)
    expect(fake.peerClosed()).toBe(1)
  })

  it("shows a refused microphone as an error the user can retry from", async () => {
    const failing = fakePrimitives({ microphoneFails: true })
    const el = mount({ primitives: failing.primitives })

    await click(el)

    expect(state(el)).toBe("error")
    expect(control(el).dataset.liveVoiceAction).toBe("start")
    expect(el.textContent?.toLowerCase()).toContain("microphone")
  })

  it("leaves the thread binding free after a failure, so the chat is unblocked", async () => {
    const store = createVoiceSessionStore()
    const fake = fakePrimitives({
      exchange: () => Promise.resolve({ error: "Live voice is unavailable." }),
    })
    const el = mount({ primitives: fake.primitives, store })

    await click(el)

    expect(state(el)).toBe("error")
    expect(store.getSnapshot().bound).toBeUndefined()
  })
})

describe("thread binding", () => {
  it("holds the thread while the call is live and releases it on hang-up", async () => {
    const store = createVoiceSessionStore()
    const el = mount({ primitives: fakePrimitives().primitives, store })

    await click(el)
    expect(store.getSnapshot().bound?.threadId).toBe(THREAD.threadId)

    await click(el)
    expect(store.getSnapshot().bound).toBeUndefined()
  })

  it("really ends the call when the shell readout stops voice", async () => {
    const store = createVoiceSessionStore()
    const fake = fakePrimitives()
    const el = mount({ primitives: fake.primitives, store })
    await click(el)
    expect(state(el)).toBe("live")

    await act(async () => {
      store.stopBound()
    })

    // Not merely relabelled: the microphone is released and the host was told.
    expect(state(el)).toBe("idle")
    expect(store.getSnapshot().bound).toBeUndefined()
    expect(fake.microphoneStopped()).toBe(1)
    expect(fake.ended()).toBe(1)
  })

  // P1: the readout is allowed to say "bound" only because the server said
  // so. These two tests are the whole difference between describing a real
  // server-side binding and dressing up a UI association as one.
  it("marks the binding confirmed when the server names the same thread", async () => {
    const store = createVoiceSessionStore()
    const fake = fakePrimitives({
      exchange: () =>
        Promise.resolve({
          threadId: "realtime-1",
          answerSdp: ANSWER_SDP,
          boundApplicationThreadId: THREAD.threadId,
        }),
    })
    const el = mount({ primitives: fake.primitives, store })

    await click(el)

    expect(state(el)).toBe("live")
    expect(store.getSnapshot().boundConfirmed).toBe(true)
  })

  it("leaves the binding unconfirmed when the server confirms nothing", async () => {
    const store = createVoiceSessionStore()
    const el = mount({ primitives: fakePrimitives().primitives, store })

    await click(el)

    expect(state(el)).toBe("live")
    expect(store.getSnapshot().bound?.threadId).toBe(THREAD.threadId)
    expect(store.getSnapshot().boundConfirmed).toBeUndefined()
  })

  it("refuses to open a call with no conversation to bind to", async () => {
    const store = createVoiceSessionStore()
    const exchange = vi.fn(() =>
      Promise.resolve({ threadId: "realtime-1", answerSdp: ANSWER_SDP }),
    )
    const el = mount({
      primitives: fakePrimitives({ exchange }).primitives,
      store,
      thread: undefined,
    })

    await click(el)

    // Since the server binds the call to a thread, a thread-less call cannot
    // be opened at all — and saying so beats a call that comes up unbound.
    expect(state(el)).toBe("error")
    expect(exchange).not.toHaveBeenCalled()
    expect(store.getSnapshot().bound).toBeUndefined()
    expect(el.textContent?.toLowerCase()).toContain("conversation")
  })

  it("does not steal a binding another thread already holds", async () => {
    const store = createVoiceSessionStore()
    store.requestBinding({
      threadId: "other-thread",
      threadSlug: "zz99yy88",
      title: "Roadmap sync",
    })
    const exchange = vi.fn(() =>
      Promise.resolve({ threadId: "thread-1", answerSdp: ANSWER_SDP }),
    )
    const fake = fakePrimitives({ exchange })
    const el = mount({ primitives: fake.primitives, store })

    await click(el)

    expect(state(el)).toBe("idle")
    expect(exchange).not.toHaveBeenCalled()
    expect(store.getSnapshot().bound?.threadId).toBe("other-thread")
    expect(store.getSnapshot().pendingRebind?.threadId).toBe(THREAD.threadId)
  })
})

describe("one voice channel", () => {
  it("refuses to open a call while dictation holds the microphone", async () => {
    const focus = createAudioFocusManager()
    focus.startCapture()
    const exchange = vi.fn(() =>
      Promise.resolve({ threadId: "thread-1", answerSdp: ANSWER_SDP }),
    )
    const el = mount({
      audioFocus: focus,
      primitives: fakePrimitives({ exchange }).primitives,
    })

    await click(el)

    expect(state(el)).toBe("error")
    expect(exchange).not.toHaveBeenCalled()
    expect(el.textContent?.toLowerCase()).toContain("dictation")
  })

  it("registers its playback so dictation can pause the agent's voice", async () => {
    const focus = createAudioFocusManager()
    const fake = fakePrimitives()
    const stopped = vi.fn()
    fake.sink.stop = stopped
    const el = mount({ audioFocus: focus, primitives: fake.primitives })
    await click(el)

    // The remote track arriving is what registers playback.
    await act(async () => {
      fake.peer.ontrack?.({ streams: [{ getTracks: () => [] }] })
    })
    expect(focus.isPlaying()).toBe(true)

    // Dictation claiming the microphone pauses the call's audio.
    act(() => focus.startCapture())
    expect(stopped).toHaveBeenCalled()
    expect(focus.isPlaying()).toBe(false)
    expect(state(el)).toBe("live")
  })
})
