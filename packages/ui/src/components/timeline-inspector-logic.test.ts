import { describe, expect, it } from "vitest"

import type { RecurrenceRule, Schedule } from "@workspace/ui/lib/timeline/schedule/types"
import {
  eligibleSiblingAnchors,
  fromBase,
  isBothEndConditions,
  naturalUnit,
  recurrenceSummary,
  setDurationField,
  setDurationQuantum,
  setOffsetField,
  toBase,
} from "./timeline-inspector-logic"

// A vector sibling aligned to another sibling by id (or to the parent).
function vec(id: string, alignTo?: string, children: Schedule[] = []): Schedule {
  return {
    kind: "vector",
    id,
    offset: { basis: 0, direction: "after", flex: 0 },
    duration: { basis: 60, flex: 0 },
    alignment: alignTo ? { kind: "endOf", siblingId: alignTo } : { kind: "startOfParent" },
    boundsMode: "fixed",
    children,
  }
}

describe("eligibleSiblingAnchors (§4.1 DAG rule)", () => {
  it("excludes the node itself", () => {
    const node = vec("a")
    const siblings = [node, vec("b"), vec("c")]
    const ids = eligibleSiblingAnchors(node, siblings).map((s) => s.id)
    expect(ids).not.toContain("a")
    expect(ids).toEqual(["b", "c"])
  })

  it("excludes a sibling whose alignment chain already reaches the node", () => {
    // b → endOf(a): b's chain reaches a. Aligning a → b would close the cycle.
    const node = vec("a")
    const b = vec("b", "a")
    const ids = eligibleSiblingAnchors(node, [node, b, vec("c")]).map((s) => s.id)
    expect(ids).not.toContain("b")
    expect(ids).toContain("c")
  })

  it("excludes a transitive chain that reaches the node (a ← c ← b)", () => {
    // b → endOf(c), c → endOf(a): both b and c chain back to a.
    const node = vec("a")
    const c = vec("c", "a")
    const b = vec("b", "c")
    const ids = eligibleSiblingAnchors(node, [node, b, c, vec("d")]).map((s) => s.id)
    expect(ids).not.toContain("b")
    expect(ids).not.toContain("c")
    expect(ids).toContain("d")
  })

  it("keeps a pre-existing mutual sibling cycle that does not involve the node", () => {
    // x → endOf(y), y → endOf(x) is an invalid pair, but neither reaches a, so
    // both remain selectable for a (their invalidity is their own concern).
    const node = vec("a")
    const x = vec("x", "y")
    const y = vec("y", "x")
    const ids = eligibleSiblingAnchors(node, [node, x, y]).map((s) => s.id)
    expect(ids).toEqual(["x", "y"])
  })

  it("excludes descendants of the node", () => {
    const child = vec("child")
    const node = vec("a", undefined, [child])
    const ids = eligibleSiblingAnchors(node, [node, child, vec("b")]).map((s) => s.id)
    expect(ids).not.toContain("child")
    expect(ids).toEqual(["b"])
  })
})

describe("time-unit conversion", () => {
  // Base values are wall-clock MILLISECONDS — the unit the store and demo
  // data speak. A seconds-scale regression here shows a 1-day span as "1000 d".
  it("naturalUnit picks the coarsest clean unit", () => {
    expect(naturalUnit(86_400_000)).toBe("d")
    expect(naturalUnit(3_600_000)).toBe("h")
    expect(naturalUnit(900_000)).toBe("min")
    expect(naturalUnit(0)).toBe("h")
  })

  it("round-trips through base", () => {
    expect(toBase(fromBase(7_200_000, "h"), "h")).toBe(7_200_000)
    expect(fromBase(86_400_000, "d")).toBe(1)
    expect(toBase(2, "d")).toBe(172_800_000)
  })
})

describe("constraint-field builders (patch shapes)", () => {
  it("sets a duration field immutably", () => {
    const d = { basis: 3600, flex: 1 }
    const next = setDurationField(d, "min", 900)
    expect(next).toEqual({ basis: 3600, flex: 1, min: 900 })
    expect(d).toEqual({ basis: 3600, flex: 1 }) // original untouched
  })

  it("clears an optional field with undefined", () => {
    const next = setDurationField({ basis: 3600, flex: 1, max: 7200 }, "max", undefined)
    expect(next).toEqual({ basis: 3600, flex: 1 })
    expect("max" in next).toBe(false)
  })

  it("never clears required basis/flex", () => {
    const next = setOffsetField({ basis: 100, direction: "after", flex: 0 }, "basis", undefined)
    expect(next.basis).toBe(100)
  })

  it("sets and clears a quantum", () => {
    const withQ = setDurationQuantum({ basis: 86400, flex: 1 }, { unit: 86400, mode: "floor" })
    expect(withQ.quantum).toEqual({ unit: 86400, mode: "floor" })
    const cleared = setDurationQuantum(withQ, undefined)
    expect("quantum" in cleared).toBe(false)
  })
})

describe("recurrenceSummary (§5.1)", () => {
  it("renders the spec's example line", () => {
    const rule: RecurrenceRule = {
      frequency: "weekly",
      interval: 2,
      daysOfWeek: [1, 3],
      count: 8,
      until: 1000,
    }
    expect(recurrenceSummary(rule, () => "Aug 15")).toBe("Every 2 weeks on Mon, Wed — 8 occurrences, ending Aug 15")
  })

  it("singular interval drops the number", () => {
    expect(recurrenceSummary({ frequency: "daily", interval: 1 })).toBe("Every day")
  })

  it("monthly days render as ordinals", () => {
    expect(recurrenceSummary({ frequency: "monthly", daysOfMonth: [1, 15] })).toBe("Every month on the 1st, 15th")
  })

  it("count-only, singular occurrence", () => {
    expect(recurrenceSummary({ frequency: "weekly", count: 1 })).toBe("Every week — 1 occurrence")
  })

  it("until-only", () => {
    expect(recurrenceSummary({ frequency: "weekly", until: 42 }, (v) => `t${v}`)).toBe("Every week — ending t42")
  })

  it("custom frequency", () => {
    expect(recurrenceSummary({ frequency: "custom", interval: 3 })).toBe("Every 3 intervals")
  })

  it("isBothEndConditions detects the both-set case", () => {
    expect(isBothEndConditions({ frequency: "weekly", count: 8, until: 1000 })).toBe(true)
    expect(isBothEndConditions({ frequency: "weekly", count: 8 })).toBe(false)
    expect(isBothEndConditions({ frequency: "weekly", until: 1000 })).toBe(false)
  })
})
