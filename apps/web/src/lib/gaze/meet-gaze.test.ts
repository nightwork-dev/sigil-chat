import { describe, expect, it } from "vitest"

import {
  MEET_GAZE_DWELL_MS,
  MEET_GAZE_RELEASE_MS,
  advanceMeetGaze,
  gazeVoiceAddressee,
  initialMeetGazeState,
  type MeetGazeSample,
  type MeetGazeState,
} from "./meet-gaze"

// Feed a scripted stream of samples through the latch, deriving all timings
// from the exported thresholds so the test can never drift from the constants.
function run(samples: readonly MeetGazeSample[]): MeetGazeState {
  return samples.reduce(advanceMeetGaze, initialMeetGazeState())
}

describe("advanceMeetGaze", () => {
  it("does not acknowledge a glance shorter than the dwell", () => {
    const state = run([
      { onPortrait: true, t: 0 },
      { onPortrait: true, t: MEET_GAZE_DWELL_MS - 1 },
    ])
    expect(state.acknowledged).toBe(false)
  })

  it("acknowledges once gaze has rested for the dwell", () => {
    const state = run([
      { onPortrait: true, t: 0 },
      { onPortrait: true, t: MEET_GAZE_DWELL_MS },
    ])
    expect(state.acknowledged).toBe(true)
  })

  it("holds acknowledgement through a brief look away (hysteresis)", () => {
    const met = run([
      { onPortrait: true, t: 0 },
      { onPortrait: true, t: MEET_GAZE_DWELL_MS },
    ])
    const stillMet = advanceMeetGaze(met, {
      onPortrait: false,
      t: MEET_GAZE_DWELL_MS + MEET_GAZE_RELEASE_MS - 1,
    })
    expect(stillMet.acknowledged).toBe(true)
  })

  it("releases after gaze has left for the release window", () => {
    const met = run([
      { onPortrait: true, t: 0 },
      { onPortrait: true, t: MEET_GAZE_DWELL_MS },
    ])
    const left = advanceMeetGaze(met, {
      onPortrait: false,
      t: MEET_GAZE_DWELL_MS,
    })
    const released = advanceMeetGaze(left, {
      onPortrait: false,
      t: MEET_GAZE_DWELL_MS + MEET_GAZE_RELEASE_MS,
    })
    expect(released.acknowledged).toBe(false)
  })
})

describe("gazeVoiceAddressee", () => {
  it("claims the agent only when met AND in a voice conversation", () => {
    expect(
      gazeVoiceAddressee({ acknowledged: true, conversationActive: true }),
    ).toBe("agent")
  })

  it("claims nothing outside a voice conversation, even when met", () => {
    expect(
      gazeVoiceAddressee({ acknowledged: true, conversationActive: false }),
    ).toBeUndefined()
  })

  it("claims nothing when the agent's gaze was not met", () => {
    expect(
      gazeVoiceAddressee({ acknowledged: false, conversationActive: true }),
    ).toBeUndefined()
  })
})
