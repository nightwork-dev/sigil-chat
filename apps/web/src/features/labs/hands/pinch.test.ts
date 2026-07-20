import { describe, expect, it } from "vitest"

import { PinchHysteresis } from "./pinch"

describe("pinch hysteresis", () => {
  it("engages and releases across asymmetric thresholds without flicker", () => {
    const pinch = new PinchHysteresis(0.7, 0.45)
    expect(pinch.update(0.69)).toEqual({
      pinched: false,
      changed: false,
      type: null,
    })
    expect(pinch.update(0.72).type).toBe("start")
    expect(pinch.update(0.55).pinched).toBe(true)
    expect(pinch.update(0.46).pinched).toBe(true)
    expect(pinch.update(0.44).type).toBe("end")
  })

  it("rejects an inverted dead band", () => {
    expect(() => new PinchHysteresis(0.5, 0.5)).toThrow(
      "release threshold must be below",
    )
  })
})
