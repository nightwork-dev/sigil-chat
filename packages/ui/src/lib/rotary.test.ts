// Rotary geometry core. Pure functions; no React, no DOM. Exercises the
// fraction<->angle round-trip, detent placement, nearest-detent snapping,
// and dead-zone clamping shared by Knob and RotarySwitch.

import { describe, expect, it } from "vitest"

import {
  ROTARY_START_DEG,
  ROTARY_SWEEP_DEG,
  angleToFraction,
  detentFraction,
  fractionToAngleDeg,
  nearestDetentIndex,
} from "./rotary"

describe("fractionToAngleDeg", () => {
  it("maps 0 to the sweep start and 1 to the sweep end", () => {
    expect(fractionToAngleDeg(0)).toBe(ROTARY_START_DEG)
    expect(fractionToAngleDeg(1)).toBe(ROTARY_START_DEG + ROTARY_SWEEP_DEG)
  })

  it("maps 0.5 to the midpoint of the sweep", () => {
    expect(fractionToAngleDeg(0.5)).toBe(ROTARY_START_DEG + ROTARY_SWEEP_DEG / 2)
  })
})

describe("angleToFraction", () => {
  it("is the inverse of fractionToAngleDeg across the sweep", () => {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const deg = fractionToAngleDeg(f)
      expect(angleToFraction(deg)).toBeCloseTo(f, 10)
    }
  })

  it("wraps angles outside [0, 360) before mapping", () => {
    // 495 === 135 (mod 360) === sweep start.
    expect(angleToFraction(495)).toBeCloseTo(0, 10)
  })

  it("clamps the bottom dead zone to whichever end is nearer", () => {
    // Dead zone spans from sweep end (405 mod 360 = 45deg) to start (135deg),
    // i.e. raw angles in (45, 135). 90deg is roughly mid-dead-zone.
    // fromStart for 90deg: (90 - 135 + 360) % 360 = 315, which is > sweep
    // (270) and > midpoint ((270+360)/2=315) is false -> snaps to sweep end (1).
    expect(angleToFraction(90)).toBe(1)
    // A raw angle just past the sweep end but still closer to it.
    expect(angleToFraction(50)).toBe(1)
    // A raw angle just before the sweep start, closer to the start (0).
    expect(angleToFraction(130)).toBe(0)
  })
})

describe("detentFraction", () => {
  it("spaces detents evenly across [0,1]", () => {
    expect(detentFraction(0, 4)).toBe(0)
    expect(detentFraction(1, 4)).toBeCloseTo(1 / 3, 10)
    expect(detentFraction(2, 4)).toBeCloseTo(2 / 3, 10)
    expect(detentFraction(3, 4)).toBe(1)
  })

  it("a single detent sits at 0", () => {
    expect(detentFraction(0, 1)).toBe(0)
  })

  it("clamps out-of-range indices", () => {
    expect(detentFraction(-1, 4)).toBe(0)
    expect(detentFraction(10, 4)).toBe(1)
  })
})

describe("nearestDetentIndex", () => {
  it("rounds a fraction to the nearest detent index", () => {
    expect(nearestDetentIndex(0, 4)).toBe(0)
    expect(nearestDetentIndex(1, 4)).toBe(3)
    expect(nearestDetentIndex(0.3, 4)).toBe(1) // 0.3*3=0.9 -> round 1
    expect(nearestDetentIndex(0.6, 4)).toBe(2) // 0.6*3=1.8 -> round 2
  })

  it("a single detent always resolves to index 0", () => {
    expect(nearestDetentIndex(0.9, 1)).toBe(0)
  })

  it("clamps out-of-range fractions before rounding", () => {
    expect(nearestDetentIndex(-0.5, 4)).toBe(0)
    expect(nearestDetentIndex(1.5, 4)).toBe(3)
  })
})

describe("round-trip: detentFraction -> fractionToAngleDeg -> angleToFraction -> nearestDetentIndex", () => {
  it("recovers the original detent index for every detent in a 5-position switch", () => {
    const count = 5
    for (let i = 0; i < count; i++) {
      const deg = fractionToAngleDeg(detentFraction(i, count))
      const fraction = angleToFraction(deg)
      expect(nearestDetentIndex(fraction, count)).toBe(i)
    }
  })
})
