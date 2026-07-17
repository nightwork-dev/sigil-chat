// Layer 1 interaction-math core. Pure functions; no React, no DOM.
// Exercises ordinary cases, degenerate/inverted domains, negative domains,
// step/origin offsets, NaN inputs (exact clamped-bound value), and the
// "never returns NaN" invariant for Infinity / -Infinity.

import { describe, expect, it } from "vitest"

import { clamp, denormalize, normalize, snapToStep, toPercent } from "./interaction"

describe("clamp", () => {
  it("returns v when in range, the nearest bound otherwise", () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(0, 0, 10)).toBe(0) // lower boundary
    expect(clamp(10, 0, 10)).toBe(10) // upper boundary
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it("NaN v resolves to the lower clamped bound (never NaN)", () => {
    expect(clamp(NaN, 0, 10)).toBe(0)
    expect(clamp(NaN, -5, 5)).toBe(-5)
  })

  it("inverted domain stays sane (finite, no throw)", () => {
    // Math.max(5, 10) = 10, then Math.min(10, 0) = 0.
    expect(clamp(5, 10, 0)).toBe(0)
    expect(Number.isNaN(clamp(5, 10, 0))).toBe(false)
  })

  it("Infinity / -Infinity land on the bounds, not NaN", () => {
    expect(clamp(Infinity, 0, 10)).toBe(10)
    expect(clamp(-Infinity, 0, 10)).toBe(0)
  })
})

describe("snapToStep", () => {
  it("snaps to the nearest multiple of step from the origin", () => {
    expect(snapToStep(7, 5)).toBe(5)
    expect(snapToStep(8, 5)).toBe(10)
    expect(snapToStep(0, 5)).toBe(0)
    // 2.5 is equidistant from 0 and 5; Math.round rounds half up → 5.
    expect(snapToStep(2.5, 5)).toBe(5)
  })

  it("honors an origin offset", () => {
    // Multiples of 5 from 1: 1, 6, 11, 16 — 7 is nearest to 6.
    expect(snapToStep(7, 5, 1)).toBe(6)
    expect(snapToStep(1, 5, 1)).toBe(1)
  })

  it("step <= 0 is passthrough — v returned unchanged", () => {
    expect(snapToStep(7, 0)).toBe(7)
    expect(snapToStep(7, -5)).toBe(7) // negative step treated as passthrough too
  })

  it("NaN v resolves to the origin", () => {
    expect(snapToStep(NaN, 5)).toBe(0) // default origin
    expect(snapToStep(NaN, 5, 3)).toBe(3)
  })

  it("Infinity / -Infinity do not produce NaN", () => {
    expect(Number.isNaN(snapToStep(Infinity, 5))).toBe(false)
    expect(Number.isNaN(snapToStep(-Infinity, 5))).toBe(false)
  })
})

describe("normalize", () => {
  it("maps v in [min, max] to t in [0, 1]", () => {
    expect(normalize(50, 0, 100)).toBe(0.5)
    expect(normalize(0, 0, 100)).toBe(0)
    expect(normalize(100, 0, 100)).toBe(1)
  })

  it("clamps out-of-range v before mapping", () => {
    expect(normalize(150, 0, 100)).toBe(1)
    expect(normalize(-50, 0, 100)).toBe(0)
  })

  it("handles negative domains", () => {
    expect(normalize(-6, -10, -2)).toBe(0.5)
    expect(normalize(-10, -10, -2)).toBe(0)
    expect(normalize(-2, -10, -2)).toBe(1)
  })

  it("degenerate domain (max <= min) → 0", () => {
    expect(normalize(5, 10, 10)).toBe(0) // max === min
    expect(normalize(5, 10, 0)).toBe(0) // max < min (inverted → degenerate)
  })

  it("NaN v → 0 (bottom of the normalized range)", () => {
    expect(normalize(NaN, 0, 100)).toBe(0)
  })

  it("Infinity / -Infinity land on the bounds, not NaN", () => {
    expect(normalize(Infinity, 0, 100)).toBe(1)
    expect(normalize(-Infinity, 0, 100)).toBe(0)
  })
})

describe("denormalize", () => {
  it("maps t in [0, 1] back to [min, max]", () => {
    expect(denormalize(0.5, 0, 100)).toBe(50)
    expect(denormalize(0, 0, 100)).toBe(0)
    expect(denormalize(1, 0, 100)).toBe(100)
  })

  it("clamps out-of-range t to [0, 1] first", () => {
    expect(denormalize(1.5, 0, 100)).toBe(100)
    expect(denormalize(-0.5, 0, 100)).toBe(0)
  })

  it("handles negative domains", () => {
    expect(denormalize(0.5, -10, -2)).toBe(-6)
    expect(denormalize(0, -10, -2)).toBe(-10)
    expect(denormalize(1, -10, -2)).toBe(-2)
  })

  it("inverted domain follows the linear formula (no throw, no NaN)", () => {
    // min + t*(max-min) = 10 + 0.5*(0-10) = 5.
    expect(denormalize(0.5, 10, 0)).toBe(5)
    expect(Number.isNaN(denormalize(0.5, 10, 0))).toBe(false)
  })

  it("NaN t → min", () => {
    expect(denormalize(NaN, 0, 100)).toBe(0)
    expect(denormalize(NaN, -10, -2)).toBe(-10)
  })

  it("Infinity / -Infinity land on the bounds, not NaN", () => {
    expect(denormalize(Infinity, 0, 100)).toBe(100)
    expect(denormalize(-Infinity, 0, 100)).toBe(0)
  })
})

describe("toPercent", () => {
  it("is normalize * 100, clamped to [0, 100]", () => {
    expect(toPercent(50, 0, 100)).toBe(50)
    expect(toPercent(0, 0, 100)).toBe(0)
    expect(toPercent(100, 0, 100)).toBe(100)
  })

  it("clamps out-of-range v to [0, 100]", () => {
    expect(toPercent(150, 0, 100)).toBe(100)
    expect(toPercent(-50, 0, 100)).toBe(0)
  })

  it("handles negative domains", () => {
    expect(toPercent(-6, -10, -2)).toBe(50)
  })

  it("inherits normalize's degenerate-domain behavior → 0", () => {
    expect(toPercent(5, 10, 10)).toBe(0)
    expect(toPercent(5, 10, 0)).toBe(0)
  })

  it("inherits normalize's NaN behavior → 0", () => {
    expect(toPercent(NaN, 0, 100)).toBe(0)
  })

  it("Infinity / -Infinity land on the bounds, not NaN", () => {
    expect(toPercent(Infinity, 0, 100)).toBe(100)
    expect(toPercent(-Infinity, 0, 100)).toBe(0)
  })
})

describe("round-trips & consistency", () => {
  it("normalize ∘ denormalize is the identity on a normal domain", () => {
    for (const v of [-10, -3, 0, 7, 10]) {
      expect(denormalize(normalize(v, -10, 10), -10, 10)).toBeCloseTo(v, 10)
    }
  })

  it("toPercent agrees with normalize * 100 on a normal domain", () => {
    expect(toPercent(25, 0, 100)).toBe(normalize(25, 0, 100) * 100)
  })
})
