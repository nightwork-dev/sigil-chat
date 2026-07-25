// @vitest-environment jsdom
//
// The Eve-voice loop, assembled: dictation that sends, replies that are
// spoken, and the four rules that keep it honest.
//
// This is the component-level file because the rules are properties of the
// WIRING, not of any one module. "Only speakable text is spoken" is true of
// the projection in isolation; what matters is that it is still true of the
// bytes leaving the browser after a real rendered message has gone through
// speakMessageParts. "Starting dictation pauses playback" is a line in the
// focus manager; what matters is that the mic control and the speech player
// are on the SAME manager, which only a mounted composer can show.
//
// Everything below the component is real: the dictation state machine, the
// speakable-text projection, the reply-selection rule, the speech player's
// ordering. Only the hardware edges are faked — a recorder, a transcription
// call, a fetch, and a playback driver.

import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import type { AgentMessage } from "@zigil/agent-surface/contracts"
import { ChatInput } from "@workspace/chat/components/chat-input"

import { speakMessageParts } from "@/lib/agent-voice"
import {
  createAudioFocusManager,
  type AudioFocusManager,
} from "@/lib/audio-focus"
import {
  NON_SPEAKABLE_PARTS,
  SPEECH_LEAK_CANARY,
} from "@/lib/speakable-parts.fixture"
import {
  createSpeechPlayer,
  type SpeechPlaybackDriver,
  type SpeechPlayer,
} from "@/lib/speech-playback"
import { useSpokenAgentReplies } from "@/lib/spoken-replies"
import { appendDictationDraft, type VoiceRecorder } from "@/lib/voice-dictation"
import {
  createVoiceSessionStore,
  type VoiceSessionStore,
} from "@/lib/voice-session-binding"
import type { RealtimeVoicePrimitives } from "@/lib/voice-realtime"

import { ComposerVoiceControl } from "./voice-composer-control"
import { LiveVoiceComposerControl } from "./live-voice-composer-control"
import { VoiceConversationControl } from "./voice-conversation-control"

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

async function rerender(element: React.ReactElement): Promise<void> {
  await act(async () => root!.render(element))
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

// ── fakes at the hardware edges ─────────────────────────────────────────────

function fakeRecorder(audio: Blob | undefined = new Blob(["audio"])): {
  recorder: VoiceRecorder
  starts: () => number
} {
  let starts = 0
  return {
    recorder: {
      start: () => {
        starts += 1
        return Promise.resolve()
      },
      stop: () => Promise.resolve(audio),
      cancel: () => {},
    },
    starts: () => starts,
  }
}

/** A playback driver the test ends explicitly, so overlap is observable
 *  rather than a race. */
function controllableDriver() {
  const started: string[] = []
  const live = new Map<string, () => void>()
  let stops = 0
  let sequence = 0

  function createDriver(): SpeechPlaybackDriver {
    const name = `utterance-${++sequence}`
    let finish: (() => void) | undefined
    let done = false
    return {
      play: () =>
        new Promise<void>((resolve) => {
          started.push(name)
          finish = () => {
            if (done) return
            done = true
            live.delete(name)
            resolve()
          }
          live.set(name, finish)
        }),
      stop: () => {
        stops += 1
        finish?.()
      },
    }
  }

  return {
    createDriver,
    started: () => started,
    liveCount: () => live.size,
    endAll: () => [...live.values()].forEach((end) => end()),
    stops: () => stops,
  }
}

/** A speech fetch that records what would actually be synthesized. */
function recordingSynth(options: { fails?: boolean } = {}) {
  const spoken: string[] = []
  const fetchImpl = (_input: string, init: RequestInit) => {
    spoken.push(JSON.parse(String(init.body)).text)
    if (options.fails) {
      return Promise.resolve({ ok: false } as unknown as Response)
    }
    return Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"])),
    } as unknown as Response)
  }
  return {
    spoken: () => spoken,
    speak: ((parts, speakOptions) =>
      speakMessageParts(parts, speakOptions, fetchImpl)) as typeof speakMessageParts,
  }
}

function liveCallPrimitives(): Partial<RealtimeVoicePrimitives> {
  return {
    getMicrophone: () => Promise.resolve({ getTracks: () => [{ stop() {} }] }),
    createPeerConnection: () => ({
      ontrack: null,
      addTrack: () => {},
      createDataChannel: (label: string) => ({ label }),
      createOffer: async () => ({ type: "offer", sdp: "offer-sdp" }),
      setLocalDescription: async () => {},
      setRemoteDescription: async () => {},
      close: () => {},
    }),
    createAudioSink: () => ({ play: () => {}, stop: () => {} }),
    exchange: () =>
      Promise.resolve({ threadId: THREAD.threadId, answerSdp: "v=0\r\n" }),
    endSession: () => Promise.resolve(true),
  }
}

// ── the composer under test ─────────────────────────────────────────────────

interface VoiceChatProps {
  readonly focus: AudioFocusManager
  readonly player: SpeechPlayer
  readonly speak: typeof speakMessageParts
  readonly store: VoiceSessionStore
  readonly createRecorder: () => VoiceRecorder
  readonly transcribe: (audio: Blob) => Promise<string | undefined>
  readonly onSend: (text: string) => void
  readonly messages: readonly AgentMessage[]
  readonly isStreaming: boolean
  readonly primitives?: Partial<RealtimeVoicePrimitives>
}

/** The same wiring `AgentChat` has, with the session reduced to the two props
 *  the voice loop actually reads (messages, isStreaming). */
function VoiceChat(props: VoiceChatProps) {
  const [active, setActive] = useState(false)
  const [value, setValue] = useState("")
  useSpokenAgentReplies({
    enabled: active,
    isStreaming: props.isStreaming,
    messages: props.messages,
    player: props.player,
    speak: props.speak,
  })
  return (
    <ChatInput
      onChange={setValue}
      onSend={() => props.onSend(value)}
      trailingControls={
        <>
          <VoiceConversationControl
            active={active}
            audioFocus={props.focus}
            onChange={setActive}
          />
          <ComposerVoiceControl
            audioFocus={props.focus}
            createRecorder={props.createRecorder}
            onDraft={(text) =>
              setValue((current) => appendDictationDraft(current, text))
            }
            onSend={props.onSend}
            store={props.store}
            thread={THREAD}
            transcribe={props.transcribe}
            voiceFirst={active}
          />
          <LiveVoiceComposerControl
            audioFocus={props.focus}
            primitives={props.primitives}
            store={props.store}
            thread={THREAD}
          />
        </>
      }
      value={value}
    />
  )
}

function harness(overrides: Partial<VoiceChatProps> = {}) {
  const focus = overrides.focus ?? createAudioFocusManager()
  const driver = controllableDriver()
  const synth = recordingSynth()
  const props: VoiceChatProps = {
    createRecorder: () => fakeRecorder().recorder,
    focus,
    isStreaming: false,
    messages: [],
    onSend: vi.fn(),
    player: createSpeechPlayer({
      audioFocus: focus,
      createDriver: driver.createDriver,
    }),
    speak: synth.speak,
    store: createVoiceSessionStore(),
    transcribe: () => Promise.resolve("hello"),
    ...overrides,
  }
  return { driver, focus, props, synth }
}

// ── element accessors ───────────────────────────────────────────────────────

function toggle(el: HTMLElement): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>(
    "button[data-voice-conversation]",
  )
  if (!button) throw new Error("voice conversation toggle did not render")
  return button
}

function mic(el: HTMLElement): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>("button[data-voice-state]")
  if (!button) throw new Error("mic control did not render")
  return button
}

function call(el: HTMLElement): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>(
    "button[data-live-voice-state]",
  )
  if (!button) throw new Error("live voice control did not render")
  return button
}

function textarea(el: HTMLElement): HTMLTextAreaElement {
  const field = el.querySelector("textarea")
  if (!field) throw new Error("composer textarea did not render")
  return field
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click()
  })
}

async function dictate(el: HTMLElement): Promise<void> {
  await click(mic(el))
  expect(mic(el).dataset.voiceState).toBe("listening")
  await click(mic(el))
}

function reply(id: string, text: string): AgentMessage {
  return { id, role: "assistant", parts: [{ type: "text", text }] }
}

// ── the mode ────────────────────────────────────────────────────────────────

describe("voice conversation mode", () => {
  it("is off by default, and dictation still only drafts", async () => {
    const { props } = harness({
      transcribe: () => Promise.resolve("remind me to call mom"),
    })
    const el = render(<VoiceChat {...props} />)

    expect(toggle(el).dataset.voiceConversation).toBe("off")
    expect(toggle(el).getAttribute("aria-pressed")).toBe("false")

    await dictate(el)

    expect(textarea(el).value).toBe("remind me to call mom")
    expect(props.onSend).not.toHaveBeenCalled()
  })

  it("turned on, the same press-to-talk gesture sends", async () => {
    const { props } = harness({ transcribe: () => Promise.resolve("send it") })
    const el = render(<VoiceChat {...props} />)

    await click(toggle(el))
    expect(toggle(el).dataset.voiceConversation).toBe("on")
    expect(toggle(el).getAttribute("aria-pressed")).toBe("true")

    await dictate(el)

    expect(props.onSend).toHaveBeenCalledWith("send it")
  })

  it("is reversible in one action", async () => {
    const { props } = harness({ transcribe: () => Promise.resolve("draft me") })
    const el = render(<VoiceChat {...props} />)

    await click(toggle(el))
    await click(toggle(el))

    expect(toggle(el).dataset.voiceConversation).toBe("off")
    await dictate(el)
    expect(textarea(el).value).toBe("draft me")
    expect(props.onSend).not.toHaveBeenCalled()
  })

  // The mode changes what a finished utterance does; it does NOT hold the
  // microphone open. Capture is one press per utterance, and nothing restarts
  // it after a reply.
  it("never becomes always-listening", async () => {
    const recorder = fakeRecorder()
    const { props } = harness({
      createRecorder: () => recorder.recorder,
      transcribe: () => Promise.resolve("one turn"),
    })
    const el = render(<VoiceChat {...props} />)

    await click(toggle(el))
    await dictate(el)

    expect(mic(el).dataset.voiceState).toBe("idle")
    expect(recorder.starts()).toBe(1)

    // A reply arriving and being spoken must not reopen the microphone.
    await rerender(
      <VoiceChat {...props} messages={[reply("m1", "Reminder set.")]} />,
    )
    expect(mic(el).dataset.voiceState).toBe("idle")
    expect(recorder.starts()).toBe(1)
  })
})

// ── reply-speaking discipline ───────────────────────────────────────────────

describe("no partial narration", () => {
  it("says nothing while the reply is still streaming, then speaks it once complete", async () => {
    const { props, synth } = harness()
    const el = render(<VoiceChat {...props} />)
    await click(toggle(el))

    const streaming = [reply("m1", "Three files")]
    await rerender(<VoiceChat {...props} isStreaming messages={streaming} />)
    expect(synth.spoken()).toEqual([])

    const settled = [reply("m1", "Three files changed.")]
    await rerender(<VoiceChat {...props} messages={settled} />)
    expect(synth.spoken()).toEqual(["Three files changed."])
  })

  it("does not read the transcript back when the mode is switched on mid-conversation", async () => {
    const history = [reply("m1", "Earlier answer.")]
    const { props, synth } = harness({ messages: history })
    const el = render(<VoiceChat {...props} messages={history} />)

    await click(toggle(el))

    expect(synth.spoken()).toEqual([])
  })
})

describe("only speakable text is spoken", () => {
  // Derived from the shared part-kind table: a new part kind upstream is
  // covered by adding one row there, not another test here.
  it("sends the assistant's words and none of the other part kinds", async () => {
    const message: AgentMessage = {
      id: "m1",
      role: "assistant",
      parts: [
        ...NON_SPEAKABLE_PARTS.map((entry) => entry.part),
        { type: "text", text: "Here is the answer." },
      ],
    }
    const { props, synth } = harness()
    const el = render(<VoiceChat {...props} />)
    await click(toggle(el))

    await rerender(<VoiceChat {...props} messages={[message]} />)

    expect(synth.spoken()).toEqual(["Here is the answer."])
    expect(synth.spoken().join(" ")).not.toContain(SPEECH_LEAK_CANARY)
  })

  it("announces a pending approval without carrying the grant", async () => {
    const message: AgentMessage = {
      id: "m1",
      role: "assistant",
      parts: [
        {
          type: "authorization",
          id: "a1",
          state: "required",
          displayName: "Image generation",
          description: `uses ${SPEECH_LEAK_CANARY}`,
          authorizationUrl: `https://example.com/${SPEECH_LEAK_CANARY}`,
        },
      ],
    }
    const { props, synth } = harness()
    const el = render(<VoiceChat {...props} />)
    await click(toggle(el))

    await rerender(<VoiceChat {...props} messages={[message]} />)

    expect(synth.spoken()).toEqual(["Image generation needs your approval."])
    expect(synth.spoken().join(" ")).not.toContain("https://")
  })

  it("makes no synth request at all for a message with nothing to say", async () => {
    const message: AgentMessage = {
      id: "m1",
      role: "assistant",
      parts: NON_SPEAKABLE_PARTS.map((entry) => entry.part),
    }
    const { props, synth } = harness()
    const el = render(<VoiceChat {...props} />)
    await click(toggle(el))

    await rerender(<VoiceChat {...props} messages={[message]} />)

    expect(synth.spoken()).toEqual([])
  })
})

describe("degrade to text", () => {
  it("a synth failure leaves the composer and the next reply working", async () => {
    const failing = recordingSynth({ fails: true })
    const { props } = harness({ speak: failing.speak })
    const el = render(<VoiceChat {...props} />)
    await click(toggle(el))

    await rerender(
      <VoiceChat {...props} messages={[reply("m1", "First answer.")]} />,
    )

    // The failure was absorbed: the request was attempted, nothing threw, and
    // the composer is untouched and still usable.
    expect(failing.spoken()).toEqual(["First answer."])
    expect(textarea(el).value).toBe("")
    expect(mic(el).dataset.voiceState).toBe("idle")

    // And it did not poison the loop — the next reply is still attempted.
    await rerender(
      <VoiceChat
        {...props}
        messages={[reply("m1", "First answer."), reply("m2", "Second answer.")]}
      />,
    )
    expect(failing.spoken()).toEqual(["First answer.", "Second answer."])
  })

  // The queue must survive one bad utterance. A synth that throws (rather
  // than returning a failed status) is exactly the case that would silently
  // abandon everything queued behind it.
  it("keeps speaking the rest of the batch when one reply's synth throws", async () => {
    const thrown: string[] = []
    const speak = ((parts) => {
      const text = parts.find((part) => part.type === "text")
      const value = text && "text" in text ? text.text : ""
      thrown.push(value)
      if (value === "First.") return Promise.reject(new Error("synth exploded"))
      return Promise.resolve({ status: "nothing-to-say" as const })
    }) as typeof speakMessageParts
    const { props } = harness({ speak })
    const el = render(<VoiceChat {...props} />)
    await click(toggle(el))

    await rerender(
      <VoiceChat
        {...props}
        messages={[reply("m1", "First."), reply("m2", "Second.")]}
      />,
    )

    expect(thrown).toEqual(["First.", "Second."])
  })

  it("does not retry a failed reply on re-render", async () => {
    const failing = recordingSynth({ fails: true })
    const { props } = harness({ speak: failing.speak })
    const messages = [reply("m1", "Only once.")]
    const el = render(<VoiceChat {...props} />)
    await click(toggle(el))

    await rerender(<VoiceChat {...props} messages={messages} />)
    await rerender(<VoiceChat {...props} messages={messages} />)

    expect(failing.spoken()).toEqual(["Only once."])
  })
})

describe("never two playbacks at once", () => {
  it("speaks two replies that landed together one after the other", async () => {
    const { driver, props } = harness()
    const el = render(<VoiceChat {...props} />)
    await click(toggle(el))

    await rerender(
      <VoiceChat
        {...props}
        messages={[reply("m1", "First."), reply("m2", "Second.")]}
      />,
    )

    // The second has not started: the queue waits for the first to finish.
    expect(driver.started()).toHaveLength(1)
    expect(driver.liveCount()).toBe(1)

    await act(async () => {
      driver.endAll()
    })

    expect(driver.started()).toHaveLength(2)
    expect(driver.liveCount()).toBe(1)
  })
})

describe("starting dictation pauses playback", () => {
  it("stops the agent mid-sentence instead of recording it back", async () => {
    const { driver, focus, props } = harness()
    const el = render(<VoiceChat {...props} />)
    await click(toggle(el))

    await rerender(
      <VoiceChat {...props} messages={[reply("m1", "Talking now.")]} />,
    )
    expect(driver.liveCount()).toBe(1)
    expect(focus.isPlaying()).toBe(true)

    await click(mic(el))

    // The behavioral consequence, not the wiring: the driver was stopped and
    // the manager no longer reports playback.
    expect(driver.stops()).toBeGreaterThan(0)
    expect(driver.liveCount()).toBe(0)
    expect(focus.isPlaying()).toBe(false)
    expect(mic(el).dataset.voiceState).toBe("listening")
  })
})

// ── never both audio paths ──────────────────────────────────────────────────

describe("voice conversation and a live call are mutually exclusive", () => {
  it("refuses the conversation while a live call is up, and says why", async () => {
    const { props } = harness({ primitives: liveCallPrimitives() })
    const el = render(<VoiceChat {...props} />)

    await click(call(el))
    expect(call(el).dataset.liveVoiceState).toBe("live")

    await click(toggle(el))

    expect(toggle(el).dataset.voiceConversation).toBe("off")
    expect(el.textContent).toContain("End the live voice call first.")
  })

  it("refuses a live call while the conversation is on, and says why", async () => {
    const { props } = harness({ primitives: liveCallPrimitives() })
    const el = render(<VoiceChat {...props} />)

    await click(toggle(el))
    await click(call(el))

    expect(call(el).dataset.liveVoiceState).toBe("error")
    expect(el.textContent).toContain("Turn off voice conversation")
  })

  it("lets the live call start once the conversation is turned off", async () => {
    const { props } = harness({ primitives: liveCallPrimitives() })
    const el = render(<VoiceChat {...props} />)

    await click(toggle(el))
    await click(toggle(el))
    await click(call(el))

    expect(call(el).dataset.liveVoiceState).toBe("live")
  })

  it("does not speak a reply while a live call owns the speakers", async () => {
    const { driver, focus, props } = harness({
      primitives: liveCallPrimitives(),
    })
    const el = render(<VoiceChat {...props} />)

    // The conversation is on first, then a call takes the channel by force of
    // the test claiming it directly — the belt to the toggle's braces.
    await click(toggle(el))
    focus.releaseMode("voice-conversation")
    focus.claimMode("live-call")

    await rerender(
      <VoiceChat {...props} messages={[reply("m1", "Would talk over.")]} />,
    )

    expect(driver.started()).toHaveLength(0)
  })
})
