import { describe, expect, it } from "vitest"
import type { Matrix, NormalizedLandmark } from "@mediapipe/tasks-vision"

import {
  extractGazeFeatures,
  extractHeadPose,
  GAZE_LANDMARKS,
} from "./features"

function landmark(x = 0, y = 0): NormalizedLandmark {
  return { x, y, z: 0, visibility: 1 }
}

function identityMatrix(): Matrix {
  return {
    rows: 4,
    columns: 4,
    data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1],
  }
}

function rotateLandmark(
  value: NormalizedLandmark,
  center: NormalizedLandmark,
  angle: number,
): NormalizedLandmark {
  const x = value.x - center.x
  const y = value.y - center.y
  return landmark(
    center.x + x * Math.cos(angle) - y * Math.sin(angle),
    center.y + x * Math.sin(angle) + y * Math.cos(angle),
  )
}

describe("gaze feature extraction", () => {
  it("extracts normalized iris offsets and openness from the documented indices", () => {
    const landmarks = Array.from({ length: 478 }, () => landmark())
    for (const eye of Object.values(GAZE_LANDMARKS)) {
      landmarks[eye.outerCorner] = landmark(0.2, 0.5)
      landmarks[eye.innerCorner] = landmark(0.4, 0.5)
      landmarks[eye.irisCenter] = landmark(0.35, 0.52)
      landmarks[eye.upperLid] = landmark(0.3, 0.48)
      landmarks[eye.lowerLid] = landmark(0.3, 0.54)
    }

    const result = extractGazeFeatures(landmarks, identityMatrix())
    expect(result.values).toHaveLength(12)
    expect(result.values.slice(0, 4)).toEqual([
      expect.closeTo(0.25),
      expect.closeTo(0.05),
      expect.closeTo(0.25),
      expect.closeTo(0.05),
    ])
    expect(result.eyeOpenness).toEqual([
      expect.closeTo(0.3),
      expect.closeTo(0.3),
    ])
  })

  it("extracts a known yaw and normalized translation", () => {
    const angle = Math.PI / 6
    const pose = extractHeadPose({
      rows: 4,
      columns: 4,
      data: [
        Math.cos(angle),
        0,
        -Math.sin(angle),
        0,
        0,
        1,
        0,
        0,
        Math.sin(angle),
        0,
        Math.cos(angle),
        0,
        3,
        4,
        0,
        1,
      ],
    })
    expect(pose.yaw).toBeCloseTo(30)
    expect(pose.translationX).toBeCloseTo(0.6)
    expect(pose.translationY).toBeCloseTo(0.8)
  })

  it("keeps iris offsets stable when the eye rolls in the image", () => {
    const landmarks = Array.from({ length: 478 }, () => landmark())
    const center = landmark(0.3, 0.5)
    const angle = Math.PI / 6
    for (const eye of Object.values(GAZE_LANDMARKS)) {
      landmarks[eye.outerCorner] = rotateLandmark(
        landmark(0.2, 0.5),
        center,
        angle,
      )
      landmarks[eye.innerCorner] = rotateLandmark(
        landmark(0.4, 0.5),
        center,
        angle,
      )
      landmarks[eye.irisCenter] = rotateLandmark(
        landmark(0.35, 0.52),
        center,
        angle,
      )
      landmarks[eye.upperLid] = rotateLandmark(
        landmark(0.3, 0.48),
        center,
        angle,
      )
      landmarks[eye.lowerLid] = rotateLandmark(
        landmark(0.3, 0.54),
        center,
        angle,
      )
    }

    const result = extractGazeFeatures(landmarks, identityMatrix())
    expect(result.values.slice(0, 4)).toEqual([
      expect.closeTo(0.25),
      expect.closeTo(0.05),
      expect.closeTo(0.25),
      expect.closeTo(0.05),
    ])
  })
})
