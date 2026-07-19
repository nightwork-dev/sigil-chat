import { describe, expect, it } from "vitest"

import { fitGazeCalibration, predictGaze } from "./calibration"

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
})
