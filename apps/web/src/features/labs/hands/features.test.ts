import type { NormalizedLandmark } from "@mediapipe/tasks-vision"
import { describe, expect, it } from "vitest"

import { extractHandFeatures, HAND_LANDMARKS, toScreenPoint } from "./features"

function landmark(x = 0.5, y = 0.5): NormalizedLandmark {
  return { x, y, z: 0, visibility: 1 }
}

function openHand() {
  const values = Array.from({ length: 21 }, () => landmark())
  values[HAND_LANDMARKS.wrist] = landmark(0.5, 0.9)
  const fingers = [
    [
      HAND_LANDMARKS.indexMcp,
      HAND_LANDMARKS.indexPip,
      HAND_LANDMARKS.indexTip,
      0.35,
    ],
    [
      HAND_LANDMARKS.middleMcp,
      HAND_LANDMARKS.middlePip,
      HAND_LANDMARKS.middleTip,
      0.47,
    ],
    [
      HAND_LANDMARKS.ringMcp,
      HAND_LANDMARKS.ringPip,
      HAND_LANDMARKS.ringTip,
      0.59,
    ],
    [
      HAND_LANDMARKS.pinkyMcp,
      HAND_LANDMARKS.pinkyPip,
      HAND_LANDMARKS.pinkyTip,
      0.71,
    ],
  ] as const
  for (const [mcp, pip, tip, x] of fingers) {
    values[mcp] = landmark(x, 0.68)
    values[pip] = landmark(x, 0.48)
    values[tip] = landmark(x, 0.18)
  }
  values[HAND_LANDMARKS.thumbMcp] = landmark(0.3, 0.68)
  values[HAND_LANDMARKS.thumbTip] = landmark(0.08, 0.48)
  return values
}

describe("hand feature extraction", () => {
  it("normalizes pinch distance by palm span", () => {
    const values = openHand()
    values[HAND_LANDMARKS.thumbTip] = landmark(0.34, 0.18)
    const features = extractHandFeatures(values, "Right", 0.9)
    expect(features.pinchRatio).toBeLessThan(0.2)
    expect(features.pinchStrength).toBeGreaterThan(0.9)
  })

  it("recognizes a stable open palm from straight fingers", () => {
    const features = extractHandFeatures(openHand(), "Left", 0.95)
    expect(features.gesture).toBe("open-palm")
    expect(features.grabStrength).toBeLessThan(0.1)
  })

  it("mirrors camera x into intuitive screen coordinates", () => {
    expect(
      toScreenPoint({ x: 0.2, y: 0.25 }, { width: 1000, height: 800 }),
    ).toEqual({
      x: 800,
      y: 200,
    })
  })

  it("rejects incomplete landmark frames", () => {
    expect(() => extractHandFeatures([landmark()], "Unknown", 0)).toThrow(
      "Expected 21 hand landmarks",
    )
  })
})
