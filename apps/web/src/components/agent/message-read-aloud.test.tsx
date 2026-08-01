// @vitest-environment jsdom
//
// The per-message "read aloud" button — the thin TTS consumer, on its own.
//
// The projection and the player are real here; only the network call and the
// audio element are faked. What this file locks is the button's own contract:
// it appears only where it can do something, a failure is silence rather than
// a broken message, and it shares the one player so it can never stack a
// second voice over the first.

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import type { AgentMessagePart } from "@zigil/agent/contracts"

import { speakMessageParts } from "@/lib/agent-voice"
import { createAudioFocusManager } from "@/lib/audio-focus"
import {
  NON_SPEAKABLE_PARTS,
  SPEECH_LEAK_CANARY,
} from "@/lib/speakable-parts.fixture"
import {
  createSpeechPlayer,
  type SpeechPlaybackDriver,
} from "@/lib/speech-playback"

import { MessageReadAloud } from "./message-read-aloud"

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

function controllableDriver() {
  const live: Array<() => void> = []
  let started = 0
  let stops = 0
  function createDriver(): SpeechPlaybackDriver {
    let finish: (() => void) | undefined
    let done = false
    return {
      play: () =>
        new Promise<void>((resolve) => {
          started += 1
          finish = () => {
            if (done) return
            done = true
            resolve()
          }
          live.push(finish)
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
    stops: () => stops,
    endAll: () => live.splice(0).forEach((end) => end()),
  }
}

function recordingSynth(options: { fails?: boolean } = {}) {
  const spoken: string[] = []
  const fetchImpl = (_input: string, init: RequestInit) => {
    spoken.push(JSON.parse(String(init.body)).text)
    if (options.fails)
      return Promise.resolve({ ok: false } as unknown as Response)
    return Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"])),
    } as unknown as Response)
  }
  return {
    spoken: () => spoken,
    speak: ((parts, speakOptions) =>
      speakMessageParts(
        parts,
        speakOptions,
        fetchImpl,
      )) as typeof speakMessageParts,
  }
}

function mount(
  parts: readonly AgentMessagePart[],
  options: { fails?: boolean } = {},
) {
  const driver = controllableDriver()
  const synth = recordingSynth(options)
  const player = createSpeechPlayer({
    audioFocus: createAudioFocusManager(),
    createDriver: driver.createDriver,
  })
  const el = render(
    <MessageReadAloud parts={parts} player={player} speak={synth.speak} />,
  )
  return { driver, el, synth }
}

function button(el: HTMLElement): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>("button[data-read-aloud]")
}

async function click(el: HTMLElement): Promise<void> {
  const target = button(el)
  if (!target) throw new Error("read-aloud button did not render")
  await act(async () => {
    target.click()
  })
}

const TEXT: readonly AgentMessagePart[] = [
  { type: "text", text: "Three files changed." },
]

describe("where the control appears", () => {
  it("offers itself on a message that has something to say", () => {
    const { el } = mount(TEXT)
    expect(button(el)).not.toBeNull()
    expect(button(el)!.getAttribute("aria-label")).toBe(
      "Read this message aloud",
    )
  })

  // A button that does nothing when pressed is worse than no button: it
  // teaches the user that the control is unreliable.
  it("renders nothing for a message that projects to no speakable text", () => {
    const { el } = mount(NON_SPEAKABLE_PARTS.map((entry) => entry.part))
    expect(button(el)).toBeNull()
  })
})

describe("playing one message", () => {
  it("speaks only the assistant's words", async () => {
    const { el, synth } = mount([
      ...NON_SPEAKABLE_PARTS.map((entry) => entry.part),
      ...TEXT,
    ])

    await click(el)

    expect(synth.spoken()).toEqual(["Three files changed."])
    expect(synth.spoken().join(" ")).not.toContain(SPEECH_LEAK_CANARY)
  })

  it("offers stopping as the same one action, and stopping really stops", async () => {
    const { driver, el } = mount(TEXT)

    await click(el)
    expect(button(el)!.dataset.readAloud).toBe("speaking")
    expect(driver.started()).toBe(1)

    await click(el)

    expect(driver.stops()).toBe(1)
    expect(button(el)!.dataset.readAloud).toBe("idle")
  })

  it("returns to resting when the audio ends on its own", async () => {
    const { driver, el } = mount(TEXT)

    await click(el)
    await act(async () => {
      driver.endAll()
    })

    expect(button(el)!.dataset.readAloud).toBe("idle")
  })
})

describe("degrade to text", () => {
  it("a synth failure is silence, and the control stays usable", async () => {
    const { driver, el, synth } = mount(TEXT, { fails: true })

    await click(el)

    expect(synth.spoken()).toEqual(["Three files changed."])
    expect(driver.started()).toBe(0)
    // Not stuck in "speaking", and it says what happened rather than
    // colouring the transcript row as an error.
    expect(button(el)!.dataset.readAloud).toBe("failed")
    expect(button(el)!.getAttribute("aria-label")).toMatch(/try again/i)

    // And it is still pressable afterwards.
    await click(el)
    expect(synth.spoken()).toHaveLength(2)
  })
})
