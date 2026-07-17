import { describe, expect, it } from "vitest"

import { normalizeDuration, normalizeOffset, normalizeSchedule } from "./normalize"
import type { Schedule } from "./types"

describe("normalize", () => {
  it("bare number → rigid DurationSpec (§1.6 sugar)", () => {
    expect(normalizeDuration(3600)).toEqual({ basis: 3600, flex: 0 })
  })

  it("full DurationSpec passes through with flex defaulted", () => {
    expect(normalizeDuration({ basis: 10, min: 5, flex: 2 })).toEqual({ basis: 10, min: 5, flex: 2 })
    expect(normalizeDuration({ basis: 10 })).toEqual({ basis: 10, flex: 0 })
  })

  it("{duration, direction} → rigid Offset (§1.5 sugar)", () => {
    expect(normalizeOffset({ duration: 100, direction: "before" })).toEqual({
      basis: 100,
      direction: "before",
      flex: 0,
    })
  })

  it("deep-normalizes vector children inside a tree", () => {
    const tree = {
      kind: "absolute",
      id: "root",
      start: 0,
      timeContext: { kind: "wallClock" },
      boundsMode: "fixed",
      children: [
        {
          kind: "vector",
          id: "child",
          alignment: { kind: "startOfParent" },
          offset: { duration: 5, direction: "after" },
          duration: 60,
          boundsMode: "fixed",
          children: [],
        } as unknown,
      ],
    } as unknown as Schedule
    const normalized = normalizeSchedule(tree)
    const child = normalized.children[0]
    expect(child.kind).toBe("vector")
    if (child.kind === "vector") {
      expect(child.duration).toEqual({ basis: 60, flex: 0 })
      expect(child.offset).toEqual({ basis: 5, direction: "after", flex: 0 })
    }
  })
})
