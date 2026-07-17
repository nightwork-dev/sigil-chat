// Pure layout math behind <EraBand> — the proportional-vs-sequence width
// model, clamping, cursor percentage, and accessible-label composition. The
// component is a thin render layer over these helpers; locking them here in
// node (per the repo's extract-the-math convention) is what guarantees mixed
// bands read honestly and the cursor aligns to the rendered axis.

import { describe, expect, it } from "vitest"

import {
  clamp01,
  cursorToPercent,
  describeEra,
  normalizeSpan,
  resolveEraLayout,
  scrollLeftForCursor,
  type EraBandEra,
} from "../lib/era-axis"

const ERA = (id: string, over: Partial<EraBandEra> = {}): EraBandEra => ({ id, label: id, ...over })

describe("clamp01", () => {
  it("passes through in-range values", () => {
    expect(clamp01(0)).toBe(0)
    expect(clamp01(1)).toBe(1)
    expect(clamp01(0.5)).toBe(0.5)
  })
  it("clamps below 0 and above 1", () => {
    expect(clamp01(-0.3)).toBe(0)
    expect(clamp01(1.4)).toBe(1)
  })
  it("maps NaN to the floor (0)", () => {
    expect(clamp01(Number.NaN)).toBe(0)
  })
})

describe("normalizeSpan", () => {
  it("clamps + orders a valid span", () => {
    expect(normalizeSpan({ start: 0.2, end: 0.7 })).toEqual({ start: 0.2, end: 0.7 })
  })
  it("returns null for a missing span (order-only)", () => {
    expect(normalizeSpan(null)).toBeNull()
    expect(normalizeSpan(undefined)).toBeNull()
  })
  it("returns null for a degenerate (zero/negative) span", () => {
    expect(normalizeSpan({ start: 0.5, end: 0.5 })).toBeNull()
    expect(normalizeSpan({ start: 0.8, end: 0.2 })).toBeNull()
  })
  it("clamps out-of-range span ends into [0,1]", () => {
    expect(normalizeSpan({ start: -1, end: 2 })).toEqual({ start: 0, end: 1 })
  })
})

describe("resolveEraLayout — all-proportional band", () => {
  it("sizes segments by span magnitude and fills [0,1] contiguously", () => {
    const out = resolveEraLayout([
      ERA("a", { span: { start: 0, end: 0.25 } }),
      ERA("b", { span: { start: 0.25, end: 0.75 } }),
      ERA("c", { span: { start: 0.75, end: 1 } }),
    ])
    expect(out.map((e) => e.id)).toEqual(["a", "b", "c"])
    expect(out.every((e) => e.mode === "proportional")).toBe(true)
    // widths ∝ magnitude: a=0.25, b=0.5, c=0.25 → 25%/50%/25%
    expect(out[0]!.start).toBe(0)
    expect(out[2]!.end).toBe(1)
    expect(out[0]!.end - out[0]!.start).toBeCloseTo(0.25)
    expect(out[1]!.end - out[1]!.start).toBeCloseTo(0.5)
  })
  it("preserves caller/array order (the backbone), not span-coordinate order", () => {
    const out = resolveEraLayout([
      ERA("late", { span: { start: 0.8, end: 1 } }),
      ERA("early", { span: { start: 0, end: 0.2 } }),
    ])
    expect(out.map((e) => e.id)).toEqual(["late", "early"])
  })
})

describe("resolveEraLayout — all-sequence band", () => {
  it("divides [0,1] into equal segments when no spans are measured", () => {
    const out = resolveEraLayout([ERA("a"), ERA("b"), ERA("c"), ERA("d")])
    expect(out.every((e) => e.mode === "sequence")).toBe(true)
    for (const e of out) {
      expect(e.end - e.start).toBeCloseTo(0.25)
    }
    expect(out[0]!.start).toBe(0)
    expect(out[out.length - 1]!.end).toBe(1)
  })
})

describe("resolveEraLayout — mixed band (the honest case)", () => {
  it("sizes proportional eras by span and sequence eras equally, all contiguous", () => {
    // a (measured 0..0.5, magnitude 0.5), b (order-only), c (measured, magnitude 0.5)
    const out = resolveEraLayout([
      ERA("a", { span: { start: 0, end: 0.5 } }),
      ERA("b"),
      ERA("c", { span: { start: 0.5, end: 1 } }),
    ])
    const a = out.find((e) => e.id === "a")!
    const b = out.find((e) => e.id === "b")!
    const c = out.find((e) => e.id === "c")!
    expect(a.mode).toBe("proportional")
    expect(c.mode).toBe("proportional")
    expect(b.mode).toBe("sequence")
    // a and c have equal magnitude (0.5) so equal width; sequence unit = mean(0.5,0.5)=0.5
    // → total = 1.5, each proportional = 1/3, sequence b = 1/3 too. All equal here.
    expect(a.end - a.start).toBeCloseTo(1 / 3)
    expect(c.end - c.start).toBeCloseTo(1 / 3)
    expect(b.end - b.start).toBeCloseTo(1 / 3)
    // contiguous, fills [0,1]
    expect(a.start).toBe(0)
    expect(b.start).toBeCloseTo(a.end)
    expect(c.start).toBeCloseTo(b.end)
    expect(c.end).toBe(1)
  })
  it("keeps the two modes visibly distinct (mode is reported per era)", () => {
    const out = resolveEraLayout([
      ERA("seq1"),
      ERA("prop", { span: { start: 0, end: 0.9 } }),
      ERA("seq2"),
    ])
    expect(out.map((e) => e.mode)).toEqual(["sequence", "proportional", "sequence"])
  })
})

describe("resolveEraLayout — degenerate spans fall back to sequence", () => {
  it("treats a zero-width span as order-only rather than vanishing", () => {
    const out = resolveEraLayout([
      ERA("a", { span: { start: 0.5, end: 0.5 } }),
      ERA("b", { span: { start: 0, end: 1 } }),
    ])
    expect(out[0]!.mode).toBe("sequence")
    expect(out[1]!.mode).toBe("proportional")
    // 'a' is visible (non-zero width), not a zero-width sliver
    expect(out[0]!.end - out[0]!.start).toBeGreaterThan(0)
  })
})

describe("resolveEraLayout — edge cases", () => {
  it("returns an empty array for an empty band", () => {
    expect(resolveEraLayout([])).toEqual([])
  })
  it("never leaves a gap or overshoot at the right edge", () => {
    const out = resolveEraLayout([
      ERA("a", { span: { start: 0, end: 0.3 } }),
      ERA("b", { span: { start: 0.3, end: 0.6 } }),
      ERA("c", { span: { start: 0.6, end: 0.9 } }),
    ])
    expect(out[out.length - 1]!.end).toBe(1)
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.start).toBeCloseTo(out[i - 1]!.end)
    }
  })
  it("does not mutate the input array", () => {
    const input = [ERA("a", { span: { start: 0, end: 0.5 } }), ERA("b")]
    const snapshot = JSON.parse(JSON.stringify(input))
    resolveEraLayout(input)
    expect(input).toEqual(snapshot)
  })
})

describe("cursorToPercent", () => {
  it("rounds a 0..1 cursor to a whole percent", () => {
    expect(cursorToPercent(0)).toBe(0)
    expect(cursorToPercent(1)).toBe(100)
    expect(cursorToPercent(0.623)).toBe(62)
  })
  it("clamps out-of-range cursors", () => {
    expect(cursorToPercent(-0.5)).toBe(0)
    expect(cursorToPercent(1.7)).toBe(100)
  })
  it("maps NaN to 0", () => {
    expect(cursorToPercent(Number.NaN)).toBe(0)
  })
})

describe("scrollLeftForCursor", () => {
  it("does not move when the cursor is already visible", () => {
    expect(scrollLeftForCursor(0.45, 300, 400, 1000)).toBe(300)
  })

  it("centers an offscreen cursor and clamps at either edge", () => {
    expect(scrollLeftForCursor(0.75, 0, 400, 1000)).toBe(550)
    expect(scrollLeftForCursor(0, 500, 400, 1000)).toBe(0)
    expect(scrollLeftForCursor(1, 0, 400, 1000)).toBe(600)
  })

  it("preserves scroll when the band does not overflow", () => {
    expect(scrollLeftForCursor(0.8, 0, 500, 500)).toBe(0)
  })
})

describe("describeEra — accessible label", () => {
  it("is just the label when there is no subtitle", () => {
    expect(describeEra(ERA("Segment A"))).toBe("Segment A")
  })
  it("appends the subtitle when present", () => {
    expect(describeEra(ERA("Segment A", { subtitle: "with notes" }))).toBe(
      "Segment A, with notes",
    )
  })
})
