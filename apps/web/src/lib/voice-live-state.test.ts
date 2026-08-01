// The live-voice machine, checked as properties over the fixture list rather
// than as a hardcoded transition table — the states a test enumerates and the
// states the control renders come from the same export.

import { describe, expect, it } from "vitest"

import {
  isLiveVoiceActive,
  LIVE_VOICE_ACTIVE_STATES,
  LIVE_VOICE_STATES,
  liveVoicePresentation,
  nextLiveVoiceState,
  type LiveVoiceEvent,
} from "./voice-live-state"

const EVENTS: readonly LiveVoiceEvent[] = ["start", "connected", "stop", "fail"]

describe("the state machine", () => {
  it("stays inside its own state list for every state/event pair", () => {
    for (const state of LIVE_VOICE_STATES) {
      for (const event of EVENTS) {
        expect(LIVE_VOICE_STATES).toContain(nextLiveVoiceState(state, event))
      }
    }
  })

  it("accepts stop from every state — no state traps the user in a call", () => {
    for (const state of LIVE_VOICE_STATES) {
      expect(nextLiveVoiceState(state, "stop")).toBe("idle")
    }
  })

  it("only opens a call from a resting state", () => {
    expect(nextLiveVoiceState("idle", "start")).toBe("connecting")
    expect(nextLiveVoiceState("error", "start")).toBe("connecting")
    // A second start while connecting or live must not restart negotiation.
    expect(nextLiveVoiceState("connecting", "start")).toBe("connecting")
    expect(nextLiveVoiceState("live", "start")).toBe("live")
  })

  it("only goes live out of connecting", () => {
    expect(nextLiveVoiceState("connecting", "connected")).toBe("live")
    for (const state of LIVE_VOICE_STATES.filter((s) => s !== "connecting")) {
      expect(nextLiveVoiceState(state, "connected")).toBe(state)
    }
  })

  it("fails from anywhere", () => {
    for (const state of LIVE_VOICE_STATES) {
      expect(nextLiveVoiceState(state, "fail")).toBe("error")
    }
  })
})

describe("active states", () => {
  it("marks exactly the states in which the app holds the microphone", () => {
    for (const state of LIVE_VOICE_STATES) {
      expect(isLiveVoiceActive(state)).toBe(
        (LIVE_VOICE_ACTIVE_STATES as readonly string[]).includes(state),
      )
    }
  })

  it("offers a way out of every active state", () => {
    for (const state of LIVE_VOICE_ACTIVE_STATES) {
      expect(liveVoicePresentation(state).action).toBe("stop")
    }
  })
})

describe("presentation", () => {
  it("gives every state a presentation that names itself", () => {
    for (const state of LIVE_VOICE_STATES) {
      expect(liveVoicePresentation(state).state).toBe(state)
    }
  })

  it("gives every state a distinct label", () => {
    const labels = LIVE_VOICE_STATES.map((s) => liveVoicePresentation(s).label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it("never reads as dictation — every label says it is a voice call", () => {
    for (const state of LIVE_VOICE_STATES) {
      const label = liveVoicePresentation(state).label.toLowerCase()
      expect(label).toMatch(/voice/)
      expect(label).not.toMatch(/dictat/)
    }
  })

  it("reserves motion for an unfinished process", () => {
    // Connecting is the only state with something genuinely in flight.
    const moving = LIVE_VOICE_STATES.filter(
      (s) => liveVoicePresentation(s).motion !== "none",
    )
    expect(moving).toEqual(["connecting"])
  })

  it("uses primary for on and destructive for failed, as everywhere else", () => {
    expect(liveVoicePresentation("live").tone).toBe("primary")
    expect(liveVoicePresentation("error").tone).toBe("destructive")
  })
})
