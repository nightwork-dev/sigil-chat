import { describe, expect, it } from "vitest"

import type { CalibrationSample } from "./calibration"
import {
  fitPoseCalibrationLayer,
  poseDistance,
  predictLayeredGaze,
  upsertPoseCalibrationLayer,
} from "./pose-calibration"

function samplesForPose(pitch: number, offsetY: number): CalibrationSample[] {
  return Array.from({ length: 16 }, (_, index) => {
    const column = index % 4
    const row = Math.floor(index / 4)
    const irisX = column * 0.1
    const irisY = row * 0.1
    return {
      features: [
        irisX,
        irisY,
        irisX + 0.001,
        irisY + 0.001,
        0.2,
        0.2,
        0,
        pitch,
        0,
        0,
        0,
        1,
      ],
      target: { x: 100 + irisX * 2000, y: offsetY + irisY * 1500 },
    }
  })
}

describe("pose-layered calibration", () => {
  it("uses eye-local maps so head pitch cannot directly throw gaze downward", () => {
    const layer = fitPoseCalibrationLayer(samplesForPose(0, 100))
    expect(
      layer.calibration.diagnostics.y.selectedFeatureIndices,
    ).not.toContain(7)
    const prediction = predictLayeredGaze(
      [layer],
      samplesForPose(35, 100)[5]!.features,
    )
    expect(prediction.point.y).toBeCloseTo(250, 0)
    expect(prediction.coverage).toBe("outside")
  })

  it("selects and blends additive maps around their recorded head positions", () => {
    const upright = fitPoseCalibrationLayer(samplesForPose(0, 100))
    const lowered = fitPoseCalibrationLayer(samplesForPose(24, 260))
    const uprightFeatures = samplesForPose(0, 100)[10]!.features
    const loweredFeatures = samplesForPose(24, 260)[10]!.features
    expect(
      predictLayeredGaze([upright, lowered], uprightFeatures).point.y,
    ).toBeCloseTo(400, -1)
    expect(
      predictLayeredGaze([upright, lowered], loweredFeatures).point.y,
    ).toBeCloseTo(560, -1)
    expect(poseDistance(lowered.pose, loweredFeatures)).toBeCloseTo(0)
  })

  it("replaces a repeated nearby pose instead of accumulating duplicates", () => {
    const first = fitPoseCalibrationLayer(samplesForPose(0, 100))
    const replacement = fitPoseCalibrationLayer(samplesForPose(2, 140))
    const distinct = fitPoseCalibrationLayer(samplesForPose(24, 260))
    expect(upsertPoseCalibrationLayer([first], replacement)).toEqual([
      replacement,
    ])
    expect(upsertPoseCalibrationLayer([first], distinct)).toHaveLength(2)
  })
})
