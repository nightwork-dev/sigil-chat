// Color conversion core. Pure functions; no React, no DOM. Exercises the
// hex<->hsb round-trip, greyscale/black/white edges, invalid-hex fallback,
// and clamping shared by ColorWheel and ColorInput.

import { describe, expect, it } from "vitest"

import { hexToHsb, hsbToCss, hsbToHex, hsbToRgb } from "./color"

describe("hsbToRgb", () => {
  it("maps pure red/green/blue at full saturation and brightness", () => {
    expect(hsbToRgb({ h: 0, s: 1, b: 1 })).toEqual([255, 0, 0])
    expect(hsbToRgb({ h: 120, s: 1, b: 1 })).toEqual([0, 255, 0])
    expect(hsbToRgb({ h: 240, s: 1, b: 1 })).toEqual([0, 0, 255])
  })

  it("maps zero saturation to greyscale regardless of hue", () => {
    expect(hsbToRgb({ h: 200, s: 0, b: 0.5 })).toEqual([128, 128, 128])
  })

  it("maps zero brightness to black and full brightness+zero saturation to white", () => {
    expect(hsbToRgb({ h: 0, s: 1, b: 0 })).toEqual([0, 0, 0])
    expect(hsbToRgb({ h: 0, s: 0, b: 1 })).toEqual([255, 255, 255])
  })

  it("wraps hue outside [0,360)", () => {
    expect(hsbToRgb({ h: 480, s: 1, b: 1 })).toEqual(hsbToRgb({ h: 120, s: 1, b: 1 }))
    expect(hsbToRgb({ h: -120, s: 1, b: 1 })).toEqual(hsbToRgb({ h: 240, s: 1, b: 1 }))
  })

  it("clamps out-of-range saturation and brightness", () => {
    expect(hsbToRgb({ h: 0, s: 2, b: 1 })).toEqual(hsbToRgb({ h: 0, s: 1, b: 1 }))
    expect(hsbToRgb({ h: 0, s: 1, b: -1 })).toEqual(hsbToRgb({ h: 0, s: 1, b: 0 }))
  })
})

describe("hsbToHex / hexToHsb round-trip", () => {
  const cases: Array<{ hex: string; hsb: { h: number; s: number; b: number } }> = [
    { hex: "#ff0000", hsb: { h: 0, s: 1, b: 1 } },
    { hex: "#00ff00", hsb: { h: 120, s: 1, b: 1 } },
    { hex: "#0000ff", hsb: { h: 240, s: 1, b: 1 } },
    { hex: "#ffffff", hsb: { h: 0, s: 0, b: 1 } },
    { hex: "#000000", hsb: { h: 0, s: 0, b: 0 } },
    { hex: "#808080", hsb: { h: 0, s: 0, b: 128 / 255 } },
  ]

  it("hsbToHex produces the expected hex for known colors", () => {
    for (const { hex, hsb } of cases) {
      expect(hsbToHex(hsb)).toBe(hex)
    }
  })

  it("hexToHsb -> hsbToHex recovers the original hex for known colors", () => {
    for (const { hex } of cases) {
      expect(hsbToHex(hexToHsb(hex))).toBe(hex)
    }
  })

  it("accepts hex without a leading #", () => {
    expect(hexToHsb("ff0000")).toEqual(hexToHsb("#ff0000"))
  })

  it("expands shorthand 3-digit hex", () => {
    expect(hexToHsb("#f00")).toEqual(hexToHsb("#ff0000"))
    expect(hexToHsb("#0f0")).toEqual(hexToHsb("#00ff00"))
  })

  it("falls back to black for malformed hex input", () => {
    expect(hexToHsb("not-a-color")).toEqual({ h: 0, s: 0, b: 0 })
    expect(hexToHsb("#ff00")).toEqual({ h: 0, s: 0, b: 0 })
    expect(hexToHsb("#gggggg")).toEqual({ h: 0, s: 0, b: 0 })
    expect(hexToHsb("")).toEqual({ h: 0, s: 0, b: 0 })
  })
})

describe("hsbToCss", () => {
  it("formats as an rgb() CSS string matching hsbToRgb", () => {
    expect(hsbToCss({ h: 0, s: 1, b: 1 })).toBe("rgb(255,0,0)")
    expect(hsbToCss({ h: 0, s: 0, b: 0 })).toBe("rgb(0,0,0)")
  })
})
