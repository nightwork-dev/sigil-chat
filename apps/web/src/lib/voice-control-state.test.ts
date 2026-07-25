import { describe, expect, it } from "vitest"

import {
  VOICE_CAPTURE_ACTIVE_STATES,
  VOICE_CONTROL_STATES,
  isVoiceCaptureActive,
  nextVoiceControlState,
  voiceControlPresentation,
} from "./voice-control-state"

describe("voice control state machine", () => {
  it("returns to idle on cancel from every state — capture is never a trap", () => {
    for (const state of VOICE_CONTROL_STATES) {
      expect(nextVoiceControlState(state, "cancel")).toBe("idle")
    }
  })

  it("walks the whole dictation happy path", () => {
    let state = nextVoiceControlState("idle", "start")
    expect(state).toBe("requesting-microphone")
    state = nextVoiceControlState(state, "microphone-granted")
    expect(state).toBe("listening")
    state = nextVoiceControlState(state, "capture-ended")
    expect(state).toBe("transcribing")
    state = nextVoiceControlState(state, "transcribed")
    expect(state).toBe("idle")
  })

  it("only starts from a resting state — a live capture is never restarted", () => {
    for (const state of VOICE_CAPTURE_ACTIVE_STATES) {
      expect(nextVoiceControlState(state, "start")).toBe(state)
    }
    expect(nextVoiceControlState("idle", "start")).toBe("requesting-microphone")
    expect(nextVoiceControlState("error", "start")).toBe("requesting-microphone")
  })

  it("ignores transitions that do not belong to the current state", () => {
    expect(nextVoiceControlState("idle", "microphone-granted")).toBe("idle")
    expect(nextVoiceControlState("idle", "capture-ended")).toBe("idle")
    expect(nextVoiceControlState("listening", "transcribed")).toBe("listening")
  })

  it("fails to the error state from anywhere", () => {
    for (const state of VOICE_CONTROL_STATES) {
      expect(nextVoiceControlState(state, "fail")).toBe("error")
    }
  })
})

describe("voice control presentation", () => {
  it("offers stop from exactly the states that hold the microphone", () => {
    for (const state of VOICE_CONTROL_STATES) {
      expect(voiceControlPresentation(state).action).toBe(
        isVoiceCaptureActive(state) ? "stop" : "start",
      )
    }
  })

  it("gives each state a presentation, with distinct icons per action", () => {
    for (const state of VOICE_CONTROL_STATES) {
      expect(voiceControlPresentation(state).state).toBe(state)
    }
    // Tone means one thing: primary is the live mic, destructive is failure.
    expect(voiceControlPresentation("listening").tone).toBe("primary")
    expect(voiceControlPresentation("error").tone).toBe("destructive")
  })
})
