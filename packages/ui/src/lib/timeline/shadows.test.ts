import { describe, expect, it } from "vitest"

import { computeSeriesShadows, findRecurringNodeId } from "./shadows"
import type { AbsoluteSchedule, OccurrenceOverrides, TimeContextProvider } from "./schedule"

const DAY = 86_400_000
const PROVIDER: TimeContextProvider = { currentValue: () => 0 }

/** A weekly recurring window, `count` occurrences, starting at t=0. */
function weeklySeries(count: number): AbsoluteSchedule {
  return {
    kind: "absolute",
    id: "series",
    start: 0,
    end: 4 * 3_600_000, // 4h window
    timeContext: { kind: "wallClock" },
    boundsMode: "fixed",
    recurrence: { frequency: "weekly", interval: 1, count },
    payload: { type: "liveops", data: {} },
    children: [],
  }
}

describe("findRecurringNodeId", () => {
  it("returns null with no recurring node", () => {
    const tree: AbsoluteSchedule = { kind: "absolute", id: "root", start: 0, timeContext: { kind: "wallClock" }, boundsMode: "fixed", children: [] }
    expect(findRecurringNodeId(tree)).toBeNull()
  })
  it("finds a nested recurring node", () => {
    const tree = weeklySeries(3)
    expect(findRecurringNodeId(tree)).toBe("series")
  })
})

describe("computeSeriesShadows (§5.2)", () => {
  it("excludes the focused occurrence (index 0)", () => {
    const shadows = computeSeriesShadows(weeklySeries(4), new Map(), PROVIDER, -DAY, 40 * DAY)
    expect(shadows).not.toBeNull()
    expect(shadows!.shadows.every((s) => s.occurrenceIndex !== 0)).toBe(true)
    // 4 occurrences, one focused, three echoes in a 40-day window (weeks 1..3).
    expect(shadows!.shadows.length).toBe(3)
    expect(shadows!.overflowCount).toBe(0)
  })

  it("caps at the nearest N and reports overflow (§5.2)", () => {
    // 30 weekly occurrences across a wide view; cap 5 keeps the 5 nearest center.
    const shadows = computeSeriesShadows(weeklySeries(30), new Map(), PROVIDER, -DAY, 30 * 7 * DAY, 5)
    expect(shadows!.shadows.length).toBe(5)
    // 30 total − 1 focused − 5 kept = 24 suppressed.
    expect(shadows!.overflowCount).toBe(24)
    expect(shadows!.overflowThrough).not.toBeNull()
  })

  it("surfaces an occurrence-0 override for the focused bar (§4.4)", () => {
    const overrides: OccurrenceOverrides = new Map([["series:0", { start: 12 * 3_600_000 }]])
    const shadows = computeSeriesShadows(weeklySeries(4), overrides, PROVIDER, -DAY, 40 * DAY)
    expect(shadows!.focusedOverrideStart).toBe(12 * 3_600_000)
  })

  it("marks a modified echo (§5.2)", () => {
    const overrides: OccurrenceOverrides = new Map([["series:1", { start: 8 * DAY }]])
    const shadows = computeSeriesShadows(weeklySeries(4), overrides, PROVIDER, -DAY, 40 * DAY)
    const echo = shadows!.shadows.find((s) => s.occurrenceIndex === 1)
    expect(echo?.isModified).toBe(true)
  })
})
