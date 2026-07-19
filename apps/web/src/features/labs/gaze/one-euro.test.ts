import { describe, expect, it } from "vitest"

import { OneEuroFilter } from "./one-euro"

describe("One Euro filter", () => {
  it("holds a constant signal", () => {
    const filter = new OneEuroFilter()
    expect(filter.filter(42, 0)).toBe(42)
    expect(filter.filter(42, 16)).toBe(42)
  })

  it("smooths a step without freezing it", () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 })
    filter.filter(0, 0)
    const first = filter.filter(100, 16)
    const later = filter.filter(100, 100)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(100)
    expect(later).toBeGreaterThan(first)
    expect(later).toBeLessThan(100)
  })
})
