// Pure snapping/ghost helpers behind the timeline drag gesture (UI spec §1,
// §3.1). The stateful hook itself (window listeners, refs) is exercised in the
// browser verification; these lock the math the gesture rides on. Lives under
// src/components/ to match the package's vitest include globs.

import { describe, expect, it } from "vitest"

import { ambientGridMs, ghostExtensions, snapTime } from "../hooks/use-timeline-event-drag"

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

describe("ambientGridMs (§1.2)", () => {
  it("is 15 minutes at day-zoom", () => {
    expect(ambientGridMs(2 * DAY)).toBe(15 * MIN)
    expect(ambientGridMs(3 * DAY)).toBe(15 * MIN)
  })
  it("is 1 hour at week-zoom", () => {
    expect(ambientGridMs(14 * DAY)).toBe(HOUR)
  })
  it("is 1 day at month-zoom", () => {
    expect(ambientGridMs(60 * DAY)).toBe(DAY)
  })
  it("is 1 week beyond a quarter", () => {
    expect(ambientGridMs(365 * DAY)).toBe(7 * DAY)
  })
})

describe("snapTime precedence (§1.1)", () => {
  it("rounds to the ambient grid when the node has no quantum", () => {
    expect(snapTime(26 * MIN, { ambientMs: 15 * MIN, bypassAmbient: false })).toBe(30 * MIN)
    expect(snapTime(7 * MIN, { ambientMs: 15 * MIN, bypassAmbient: false })).toBe(0)
  })

  it("lets Alt bypass the ambient grid for precise placement", () => {
    expect(snapTime(26 * MIN, { ambientMs: 15 * MIN, bypassAmbient: true })).toBe(26 * MIN)
  })

  it("always snaps to the node quantum — it wins over the ambient grid and cannot be bypassed by Alt", () => {
    // Node quantum 10m present: target rounds to 10m multiples regardless of the
    // coarser ambient grid AND regardless of the Alt bypass being held.
    expect(snapTime(26 * MIN, { nodeQuantumMs: 10 * MIN, ambientMs: 15 * MIN, bypassAmbient: false })).toBe(30 * MIN)
    expect(snapTime(26 * MIN, { nodeQuantumMs: 10 * MIN, ambientMs: 15 * MIN, bypassAmbient: true })).toBe(30 * MIN)
    expect(snapTime(24 * MIN, { nodeQuantumMs: 10 * MIN, ambientMs: 15 * MIN, bypassAmbient: true })).toBe(20 * MIN)
  })

  it("passes the raw value through when there is no grid at all", () => {
    expect(snapTime(12345, { ambientMs: 0, bypassAmbient: false })).toBe(12345)
  })
})

describe("ghostExtensions (§3.1)", () => {
  it("emits a rect for each edge the live window pushed past its baseline", () => {
    expect(ghostExtensions({ start: 0, end: 100 }, { start: 20, end: 80 })).toEqual([
      { start: 0, end: 20 },
      { start: 80, end: 100 },
    ])
  })

  it("emits only the extended edge", () => {
    expect(ghostExtensions({ start: 20, end: 120 }, { start: 20, end: 80 })).toEqual([{ start: 80, end: 120 }])
  })

  it("emits nothing when the window shrank or held", () => {
    expect(ghostExtensions({ start: 30, end: 70 }, { start: 20, end: 80 })).toEqual([])
    expect(ghostExtensions({ start: 20, end: 80 }, { start: 20, end: 80 })).toEqual([])
  })

  it("emits nothing without a baseline to compare against", () => {
    expect(ghostExtensions({ start: 0, end: 100 }, undefined)).toEqual([])
  })
})
