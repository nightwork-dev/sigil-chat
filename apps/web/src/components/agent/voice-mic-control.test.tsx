// @vitest-environment jsdom
//
// US-006 AC1/AC2/AC4: the composer's mic control renders every voice state
// distinctly, and every state that holds the microphone can be left from the
// control itself. The state list is imported, never retyped here — adding a
// sixth state to the union makes these tests cover it automatically.

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import {
  VOICE_CAPTURE_ACTIVE_STATES,
  VOICE_CONTROL_STATES,
  isVoiceCaptureActive,
  voiceControlPresentation,
} from "@/lib/voice-control-state"

import { VoiceMicControl } from "./voice-mic-control"

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

function micButton(el: HTMLElement): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>("button[data-voice-state]")
  if (!button) throw new Error("mic control did not render a button")
  return button
}

describe("VoiceMicControl states", () => {
  it.each(VOICE_CONTROL_STATES)("renders %s with its own affordance", (state) => {
    const el = render(
      <VoiceMicControl onStart={() => {}} onStop={() => {}} state={state} />,
    )
    const button = micButton(el)
    expect(button.dataset.voiceState).toBe(state)
    expect(button.getAttribute("aria-label")).toBe(
      voiceControlPresentation(state).label,
    )
    // An icon is always drawn, and the "on" state is the only one that
    // reports itself pressed.
    expect(button.querySelector("svg")).toBeTruthy()
    expect(button.getAttribute("aria-pressed")).toBe(
      String(isVoiceCaptureActive(state)),
    )
  })

  it("gives every state a distinct accessible name", () => {
    const labels = VOICE_CONTROL_STATES.map(
      (state) => voiceControlPresentation(state).label,
    )
    expect(new Set(labels).size).toBe(VOICE_CONTROL_STATES.length)
  })

  it("animates only while a permission or transcript is outstanding", () => {
    for (const state of VOICE_CONTROL_STATES) {
      const motion = voiceControlPresentation(state).motion
      const expected =
        state === "requesting-microphone"
          ? "pulse"
          : state === "transcribing"
            ? "spin"
            : "none"
      expect(motion).toBe(expected)
    }
  })

  it("shows the failure reason as text only in the error state", () => {
    const failed = render(
      <VoiceMicControl
        errorMessage="Microphone unavailable"
        onStart={() => {}}
        onStop={() => {}}
        state="error"
      />,
    )
    expect(failed.textContent).toContain("Microphone unavailable")
    act(() => root!.unmount())
    host!.remove()

    const listening = render(
      <VoiceMicControl
        errorMessage="Microphone unavailable"
        onStart={() => {}}
        onStop={() => {}}
        state="listening"
      />,
    )
    expect(listening.textContent).not.toContain("Microphone unavailable")
  })
})

describe("VoiceMicControl reachability", () => {
  it.each(VOICE_CAPTURE_ACTIVE_STATES)(
    "offers a working stop from %s — no state traps capture",
    (state) => {
      const onStop = vi.fn()
      const onStart = vi.fn()
      const el = render(
        <VoiceMicControl onStart={onStart} onStop={onStop} state={state} />,
      )
      const button = micButton(el)
      expect(button.dataset.voiceAction).toBe("stop")
      expect(button.disabled).toBe(false)
      act(() => button.click())
      expect(onStop).toHaveBeenCalledTimes(1)
      expect(onStart).not.toHaveBeenCalled()
    },
  )

  it.each(
    VOICE_CONTROL_STATES.filter((state) => !isVoiceCaptureActive(state)),
  )("starts capture from %s — activation is an explicit click", (state) => {
    const onStop = vi.fn()
    const onStart = vi.fn()
    const el = render(
      <VoiceMicControl onStart={onStart} onStop={onStop} state={state} />,
    )
    const button = micButton(el)
    expect(button.dataset.voiceAction).toBe("start")
    act(() => button.click())
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStop).not.toHaveBeenCalled()
  })
})
