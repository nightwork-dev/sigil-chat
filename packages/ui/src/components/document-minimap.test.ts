// Pure positioning/ordering semantics behind <DocumentMinimap>. The component
// is a thin render layer; the contract callers + a11y rely on (clamp, document
// + focus order, viewport band, jump resolution) is locked here in node,
// matching the repo's extract-the-math convention (see timeline-drag-logic).

import { describe, expect, it } from "vitest"

import {
  centerBand,
  clamp01,
  clampBandStart,
  normalizeViewport,
  pointerToFraction,
  positionToPercent,
  resolveJumpTarget,
  sortByPosition,
  type MinimapMarker,
} from "../lib/minimap"

const MARKER = (id: string, position: number, kind = "note"): MinimapMarker => ({ id, position, kind, label: id })

describe("clamp01", () => {
  it("passes through in-range values", () => {
    expect(clamp01(0)).toBe(0)
    expect(clamp01(1)).toBe(1)
    expect(clamp01(0.5)).toBe(0.5)
  })
  it("clamps below 0 and above 1", () => {
    expect(clamp01(-0.4)).toBe(0)
    expect(clamp01(1.7)).toBe(1)
  })
  it("maps NaN to the floor (0), never propagating a poisoned position", () => {
    expect(clamp01(Number.NaN)).toBe(0)
  })
})

describe("positionToPercent", () => {
  it("scales 0..1 to 0..100 and clamps", () => {
    expect(positionToPercent(0)).toBe(0)
    expect(positionToPercent(1)).toBe(100)
    expect(positionToPercent(0.25)).toBe(25)
    expect(positionToPercent(-1)).toBe(0)
    expect(positionToPercent(2)).toBe(100)
  })
})

describe("sortByPosition — document + focus order", () => {
  it("orders markers ascending by position", () => {
    const out = sortByPosition([MARKER("c", 0.8), MARKER("a", 0.1), MARKER("b", 0.5)])
    expect(out.map((m) => m.id)).toEqual(["a", "b", "c"])
  })
  it("is stable on ties (input order preserved)", () => {
    const out = sortByPosition([MARKER("first", 0.5), MARKER("second", 0.5), MARKER("third", 0.5)])
    expect(out.map((m) => m.id)).toEqual(["first", "second", "third"])
  })
  it("does not mutate the input array", () => {
    const input = [MARKER("c", 0.9), MARKER("a", 0.1)]
    const snapshot = input.map((m) => m.id)
    sortByPosition(input)
    expect(input.map((m) => m.id)).toEqual(snapshot)
  })
  // The a11y-critical property: after sorting, DOM order (and therefore Tab /
  // screen-reader reading order) follows the document top-to-bottom.
  it("makes focus order follow document order, not caller-supplied order", () => {
    const suppliedOutOfOrder = [MARKER("bottom", 0.99), MARKER("top", 0.01), MARKER("mid", 0.5)]
    const domOrder = sortByPosition(suppliedOutOfOrder)
    const focusOrder = domOrder.map((m) => m.id)
    expect(focusOrder).toEqual(["top", "mid", "bottom"])
  })
})

describe("resolveJumpTarget", () => {
  it("finds the marker for a delivered id", () => {
    const markers = [MARKER("a", 0.1), MARKER("b", 0.6)]
    expect(resolveJumpTarget(markers, "b")?.id).toBe("b")
  })
  it("returns undefined for a stale/unknown id (no throw — recoverable)", () => {
    const markers = [MARKER("a", 0.1)]
    expect(resolveJumpTarget(markers, "gone")).toBeUndefined()
    expect(resolveJumpTarget([], "anything")).toBeUndefined()
  })
})

describe("normalizeViewport", () => {
  it("clamps a valid window into [0,1]", () => {
    expect(normalizeViewport({ start: 0.2, end: 0.7 })).toEqual({ start: 0.2, end: 0.7 })
  })
  it("returns null when there is no viewport", () => {
    expect(normalizeViewport(undefined)).toBeNull()
  })
  it("returns null for a degenerate (zero or negative) window", () => {
    expect(normalizeViewport({ start: 0.5, end: 0.5 })).toBeNull()
    expect(normalizeViewport({ start: 0.8, end: 0.2 })).toBeNull()
  })
  it("ensures start <= end in the returned band", () => {
    const band = normalizeViewport({ start: 0.3, end: 0.9 })!
    expect(band.start).toBeLessThanOrEqual(band.end)
  })
  it("suppresses a window that covers essentially the whole document (nothing to scrub)", () => {
    // An unclamped out-of-range window that clamps down to the full [0,1]
    // track — the exact shape a barely-overflowing document produces.
    expect(normalizeViewport({ start: -1, end: 2 })).toBeNull()
    expect(normalizeViewport({ start: 0, end: 1 })).toBeNull()
    // Just under the threshold still renders — there IS something to scrub.
    expect(normalizeViewport({ start: 0, end: 0.98 })).toEqual({ start: 0, end: 0.98 })
    // Just at/over the threshold suppresses, even without touching an edge.
    expect(normalizeViewport({ start: 0.005, end: 0.995 })).toBeNull()
  })
})

describe("pointerToFraction — brush drag geometry", () => {
  it("maps a clientY at the track top/bottom to 0/1", () => {
    expect(pointerToFraction(100, 100, 200)).toBe(0)
    expect(pointerToFraction(300, 100, 200)).toBe(1)
  })
  it("maps the track midpoint to 0.5", () => {
    expect(pointerToFraction(200, 100, 200)).toBe(0.5)
  })
  it("clamps a pointer above/below the track into [0,1]", () => {
    expect(pointerToFraction(0, 100, 200)).toBe(0)
    expect(pointerToFraction(1000, 100, 200)).toBe(1)
  })
  it("degrades to 0 for a zero-height track instead of dividing by zero", () => {
    expect(pointerToFraction(150, 100, 0)).toBe(0)
  })
})

describe("clampBandStart — drag translates, never resizes", () => {
  it("passes an in-bounds start through unchanged, preserving span", () => {
    expect(clampBandStart(0.3, 0.2)).toEqual({ start: 0.3, end: 0.5 })
  })
  it("pins the band to the top edge without shrinking it", () => {
    const band = clampBandStart(-0.5, 0.2)
    expect(band).toEqual({ start: 0, end: 0.2 })
  })
  it("pins the band to the bottom edge without shrinking it", () => {
    const band = clampBandStart(0.95, 0.2)
    expect(band).toEqual({ start: 0.8, end: 1 })
  })
  it("a full-span band (1) always sits exactly at [0,1]", () => {
    expect(clampBandStart(0.5, 1)).toEqual({ start: 0, end: 1 })
    expect(clampBandStart(-2, 1)).toEqual({ start: 0, end: 1 })
  })
})

describe("centerBand — empty-track click, scrubber jump", () => {
  it("centers the band on the click point when there's room on both sides", () => {
    const band = centerBand(0.5, 0.2)
    expect(band.start).toBeCloseTo(0.4)
    expect(band.end).toBeCloseTo(0.6)
  })
  it("clamps to the top edge instead of centering off-track", () => {
    expect(centerBand(0.02, 0.2)).toEqual({ start: 0, end: 0.2 })
  })
  it("clamps to the bottom edge instead of centering off-track", () => {
    expect(centerBand(0.98, 0.2)).toEqual({ start: 0.8, end: 1 })
  })
  it("always returns a band with the requested span (when it fits)", () => {
    const band = centerBand(0.5, 0.3)
    expect(band.end - band.start).toBeCloseTo(0.3)
  })
})
