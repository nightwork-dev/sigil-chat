import { describe, expect, it } from "vitest"

import {
  beginProtocolDrag,
  buildHandsProtocolReport,
  createPinchTrials,
  currentGesturePrompt,
  currentPinchTrial,
  endProtocolDrag,
  GESTURE_CLASSES,
  PINCH_TARGET_SIZES,
  recordGestureResult,
  recordPerformance,
  recordPinchAttempt,
  recordProtocolDragPoint,
  startHandsProtocol,
} from "./protocol"

describe("hands accuracy protocol", () => {
  it("creates 16 decreasing-size pinch targets", () => {
    const trials = createPinchTrials({ width: 1200, height: 800 }, () => 0.5)
    expect(trials).toHaveLength(16)
    expect(new Set(trials.map((trial) => trial.size))).toEqual(
      new Set(PINCH_TARGET_SIZES),
    )
    expect(trials.map((trial) => trial.size)).toEqual(
      [...trials.map((trial) => trial.size)].sort((a, b) => b - a),
    )
  })

  it("runs pinch, drag, and gesture phases into a numeric report", () => {
    let state = startHandsProtocol(0, { width: 1200, height: 800 }, () => 0.5)
    while (state.phase === "pinch") {
      const trial = currentPinchTrial(state)
      expect(trial).not.toBeNull()
      state = recordPinchAttempt(state, trial!.center)
      state = recordPerformance(state, 4)
    }

    const path = state.dragPath
    state = beginProtocolDrag(state, path[0]!)
    for (const point of path) state = recordProtocolDragPoint(state, point)
    state = endProtocolDrag(state)
    expect(state.phase).toBe("gestures")

    while (state.phase === "gestures") {
      const expected = currentGesturePrompt(state)
      expect(GESTURE_CLASSES).toContain(expected)
      state = recordGestureResult(state, expected!)
      state = recordPerformance(state, 4)
    }

    const report = buildHandsProtocolReport(state, 10_000)
    expect(report?.pinch.smallestReliableTargetPx).toBe(24)
    expect(report?.drag.meanErrorPx).toBeCloseTo(0)
    expect(report?.gestures.accuracyPercent).toBe(100)
    expect(report?.recommendations).toEqual({
      tier1Cursor: "wire",
      tier2Manipulation: "wire",
      tier3Gestures: "wire",
    })
  })
})
