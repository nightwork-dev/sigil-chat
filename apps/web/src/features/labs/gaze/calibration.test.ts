import { describe, expect, it } from "vitest"

import {
  createCalibrationTargets,
  fitGazeCalibration,
  leaveOneTargetOutResiduals,
  predictGaze,
  summarizeCalibrationTarget,
} from "./calibration"

describe("ridge gaze calibration", () => {
  it("recovers a closed-form linear screen map", () => {
    const samples = Array.from({ length: 20 }, (_, index) => {
      const a = index - 10
      const b = (index % 5) - 2
      return {
        features: [a, b],
        target: { x: 2 * a - 3 * b + 11, y: -a + 4 * b - 7 },
      }
    })
    const calibration = fitGazeCalibration(samples, 0)
    expect(predictGaze(calibration, [3, -2])).toEqual({
      x: expect.closeTo(23),
      y: expect.closeTo(-18),
    })
  })

  it("rejects an underdetermined fit", () => {
    expect(() =>
      fitGazeCalibration([{ features: [1, 2], target: { x: 0, y: 0 } }]),
    ).toThrow(/more samples/)
  })

  it("uses axis-specific standardized features", () => {
    const samples = Array.from({ length: 16 }, (_, index) => {
      const horizontal = (index % 4) * 1e-4
      const vertical = Math.floor(index / 4) * 1e4
      const noise = index % 2 === 0 ? 1e8 : -1e8
      return {
        features: [horizontal, vertical, noise],
        target: {
          x: 100 + horizontal * 2e6,
          y: 50 + vertical * 0.02,
        },
      }
    })
    const calibration = fitGazeCalibration(samples, {
      xFeatureIndices: [0],
      yFeatureIndices: [1],
      lambdaCandidates: [0],
    })
    expect(predictGaze(calibration, [0.00015, 15_000, 999])).toEqual({
      x: expect.closeTo(400),
      y: expect.closeTo(350),
    })
    expect(
      Math.max(...leaveOneTargetOutResiduals(samples, calibration)),
    ).toBeLessThan(1e-6)
  })

  it("rejects frame outliers before summarizing a target", () => {
    const frames = Array.from({ length: 9 }, (_, index) => ({
      features: [1 + index * 0.001, 2 - index * 0.001],
      target: { x: 200, y: 300 },
    }))
    frames.push({
      features: [100, -100],
      target: { x: 200, y: 300 },
    })
    const summary = summarizeCalibrationTarget(frames)
    expect(summary.retainedFrames).toBe(9)
    expect(summary.sample.features[0]).toBeCloseTo(1.004)
    expect(summary.sample.features[1]).toBeCloseTo(1.996)
  })

  it("creates sixteen unique randomized calibration targets", () => {
    const targets = createCalibrationTargets(() => 0.25)
    expect(targets).toHaveLength(16)
    expect(new Set(targets.map((target) => target.join(","))).size).toBe(16)
    expect(targets[0]).not.toEqual([0.1, 0.1])
  })
})
