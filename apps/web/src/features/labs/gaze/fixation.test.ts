import { describe, expect, it } from "vitest"

import { FixationSettler } from "./fixation"

function features(overrides: Partial<Record<number, number>> = {}) {
  return Array.from({ length: 12 }, (_, index) => overrides[index] ?? 0)
}

describe("FixationSettler", () => {
  it("waits for a full stable evidence window", () => {
    const settler = new FixationSettler({ windowFrames: 4 })
    expect(settler.update(features()).stable).toBe(false)
    expect(settler.update(features({ 0: 0.005 })).stable).toBe(false)
    expect(settler.update(features({ 0: 0.01 })).stable).toBe(false)
    expect(settler.update(features({ 0: 0.012 })).stable).toBe(true)
  })

  it("rejects eye or head movement and recovers after it leaves the window", () => {
    const settler = new FixationSettler({ windowFrames: 3 })
    settler.update(features())
    settler.update(features())
    expect(settler.update(features({ 6: 4 })).stable).toBe(false)
    settler.update(features())
    expect(settler.update(features()).stable).toBe(false)
    expect(settler.update(features()).stable).toBe(true)
  })
})
