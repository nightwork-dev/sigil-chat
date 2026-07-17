// Viz geometry core tests. Pure functions; no React, no DOM. Exercises
// domain->pixel mapping (including the baked-in y-flip and padding),
// degenerate domains, empty point sets, and path generator output.

import { describe, expect, it } from "vitest"

import { areaPath, linePath, makeFrame } from "./viz-scale"

describe("makeFrame", () => {
  it("maps x domain bounds to the padded plot's left/right pixel edges", () => {
    const frame = makeFrame({ xDomain: [0, 10], yDomain: [0, 10], width: 100, height: 100 })
    expect(frame.x(0)).toBe(0)
    expect(frame.x(10)).toBe(100)
    expect(frame.x(5)).toBeCloseTo(50, 10)
  })

  it("bakes in the y-flip: larger domain y maps to smaller pixel y", () => {
    const frame = makeFrame({ xDomain: [0, 10], yDomain: [0, 10], width: 100, height: 100 })
    expect(frame.y(0)).toBe(100) // domain min -> bottom of the box
    expect(frame.y(10)).toBe(0) // domain max -> top of the box
    expect(frame.y(5)).toBeCloseTo(50, 10)
  })

  it("respects uniform padding on all four sides", () => {
    const frame = makeFrame({ xDomain: [0, 10], yDomain: [0, 10], width: 120, height: 120, pad: 10 })
    expect(frame.plotLeft).toBe(10)
    expect(frame.plotRight).toBe(110)
    expect(frame.plotTop).toBe(10)
    expect(frame.plotBottom).toBe(110)
    expect(frame.x(0)).toBe(10)
    expect(frame.x(10)).toBe(110)
    expect(frame.y(0)).toBe(110)
    expect(frame.y(10)).toBe(10)
  })

  it("respects per-side padding overrides", () => {
    const frame = makeFrame({
      xDomain: [0, 10],
      yDomain: [0, 10],
      width: 200,
      height: 150,
      pad: { left: 30, right: 10, top: 5, bottom: 20 },
    })
    expect(frame.plotLeft).toBe(30)
    expect(frame.plotRight).toBe(190)
    expect(frame.plotTop).toBe(5)
    expect(frame.plotBottom).toBe(130)
  })

  it("degenerate domain (lo === hi) maps every value to the range midpoint, never NaN", () => {
    const frame = makeFrame({ xDomain: [5, 5], yDomain: [3, 3], width: 100, height: 100 })
    expect(frame.x(5)).toBe(50)
    expect(frame.x(0)).toBe(50)
    expect(frame.x(1000)).toBe(50)
    expect(frame.y(3)).toBe(50)
    expect(frame.y(-1000)).toBe(50)
    expect(Number.isNaN(frame.x(5))).toBe(false)
    expect(Number.isNaN(frame.y(3))).toBe(false)
  })
})

describe("linePath", () => {
  const frame = makeFrame({ xDomain: [0, 10], yDomain: [0, 10], width: 100, height: 100 })

  it("returns an empty string for an empty point set", () => {
    expect(linePath([], frame)).toBe("")
  })

  it("produces an SVG path string starting with M for a moveto", () => {
    const d = linePath(
      [
        [0, 0],
        [5, 5],
        [10, 10],
      ],
      frame,
    )
    expect(d.startsWith("M")).toBe(true)
    expect(d).toContain("L")
  })

  it("is monotonic in x for a monotonic input series", () => {
    const d = linePath(
      [
        [0, 0],
        [10, 10],
      ],
      frame,
    )
    // (0,0) -> pixel (0,100); (10,10) -> pixel (100,0)
    expect(d).toBe("M0,100L100,0")
  })
})

describe("areaPath", () => {
  const frame = makeFrame({ xDomain: [0, 10], yDomain: [0, 10], width: 100, height: 100 })

  it("returns an empty string for an empty point set", () => {
    expect(areaPath([], frame)).toBe("")
  })

  it("fills down to the y=0 baseline by default", () => {
    const d = areaPath(
      [
        [0, 10],
        [10, 10],
      ],
      frame,
    )
    // Top edge at pixel y=0 (domain y=10), baseline at pixel y=100 (domain y=0).
    expect(d).toContain("0")
    expect(d).toContain("100")
    expect(d.startsWith("M")).toBe(true)
  })

  it("fills down to a custom baseline", () => {
    const d = areaPath(
      [
        [0, 10],
        [10, 10],
      ],
      frame,
      5,
    )
    // Custom baseline at domain y=5 -> pixel y=50.
    expect(d).toContain("50")
  })
})
