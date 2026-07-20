import { describe, expect, it } from "vitest"

import { LocalCorrectionField } from "./corrections"

describe("LocalCorrectionField", () => {
  it("nudges a nearby estimate toward taught truth without changing distant points", () => {
    const field = new LocalCorrectionField({ radius: 200 })
    field.teach({ x: 700, y: 300 }, { x: 500, y: 300 })
    const nearby = field.apply({ x: 700, y: 300 })
    expect(nearby.x).toBeLessThan(700)
    expect(nearby.x).toBeGreaterThan(500)
    expect(field.apply({ x: 50, y: 50 })).toEqual({ x: 50, y: 50 })
  })

  it("strengthens and merges repeated evidence at the same location", () => {
    const field = new LocalCorrectionField()
    field.teach({ x: 700, y: 300 }, { x: 500, y: 300 })
    const first = field.apply({ x: 700, y: 300 }).x
    field.teach({ x: 690, y: 305 }, { x: 505, y: 305 })
    const second = field.apply({ x: 700, y: 300 }).x
    expect(second).toBeLessThan(first)
    expect(field.getAnchors()).toHaveLength(1)
    expect(field.getAnchors()[0]?.visits).toBe(2)
  })
})
