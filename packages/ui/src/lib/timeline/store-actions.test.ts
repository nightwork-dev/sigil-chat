import { describe, expect, it } from "vitest"

import { createTimelineStore } from "./store"
import type { AbsoluteSchedule, VectorSchedule } from "./schedule"

const DAY = 86_400_000
const HOUR = 3_600_000

/** Auto parent, two chained phases: flexible p1 (floor 1d) then rigid p2 (2d). */
function fitTree(): AbsoluteSchedule {
  return {
    kind: "absolute",
    id: "root",
    start: 0,
    timeContext: { kind: "wallClock" },
    boundsMode: "auto",
    payload: { type: "group", data: {} },
    children: [
      {
        kind: "vector",
        id: "p1",
        alignment: { kind: "startOfParent" },
        offset: { basis: 0, direction: "after", flex: 0 },
        duration: { basis: 4 * DAY, min: 1 * DAY, flex: 1 },
        boundsMode: "fixed",
        payload: { type: "phase", data: {} },
        children: [],
      },
      {
        kind: "vector",
        id: "p2",
        alignment: { kind: "endOf", siblingId: "p1" },
        offset: { basis: 0, direction: "after", flex: 0 },
        duration: { basis: 2 * DAY, flex: 0 },
        boundsMode: "fixed",
        payload: { type: "phase", data: {} },
        children: [],
      },
    ],
  }
}

function makeStore(tree: AbsoluteSchedule) {
  return createTimelineStore({ tree, viewStart: -DAY, viewEnd: 10 * DAY })
}

describe("fit (§4.5)", () => {
  it("succeeds above the min window: compresses, reports, one undo entry, no blockers", () => {
    const store = makeStore(fitTree())
    const before = store.getState()
    const result = store.getState().fit("root", 4 * DAY) // basis span 6d → 4d
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.report.length).toBeGreaterThan(0)
    expect(store.getState().blockers).toEqual([])
    expect(store.getState().past.length).toBe(before.past.length + 1)
    expect(store.getState().tree).not.toBe(before.tree)
  })

  it("fails below the min window: moves nothing, records blockers", () => {
    const store = makeStore(fitTree())
    const before = store.getState().tree
    const result = store.getState().fit("root", 2 * DAY) // < 3d floor
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.deficit).toBeGreaterThan(0)
      expect(result.blockers.length).toBeGreaterThan(0)
    }
    expect(store.getState().tree).toBe(before) // nothing moved
    expect(store.getState().blockers.length).toBeGreaterThan(0)
  })

  it("clears blockers on the next successful mutation", () => {
    const store = makeStore(fitTree())
    store.getState().fit("root", 2 * DAY)
    expect(store.getState().blockers.length).toBeGreaterThan(0)
    store.getState().fit("root", 5 * DAY)
    expect(store.getState().blockers).toEqual([])
  })

  it("reports the min window (§7.5)", () => {
    const store = makeStore(fitTree())
    expect(store.getState().minimalWindowOf("root")).toBe(3 * DAY)
  })
})

describe("moveOccurrence coalescing (§4.4/§7)", () => {
  it("folds a drag of one occurrence into a single undo entry", () => {
    const store = makeStore(fitTree())
    const base = store.getState().past.length
    store.getState().moveOccurrence("root", 2, 1 * DAY)
    store.getState().moveOccurrence("root", 2, 2 * DAY)
    store.getState().moveOccurrence("root", 2, 3 * DAY)
    expect(store.getState().past.length).toBe(base + 1)
    expect(store.getState().overrides.get("root:2")?.start).toBe(3 * DAY)
  })

  it("preserves other override fields when moving", () => {
    const store = makeStore(fitTree())
    store.getState().cancelOccurrence("root", 1, true)
    store.getState().moveOccurrence("root", 1, 5 * DAY)
    expect(store.getState().overrides.get("root:1")).toEqual({ cancelled: true, start: 5 * DAY })
  })
})

describe("applyPatch (§4.1–4.2)", () => {
  it("replaces a vector node's duration whole, one undo entry", () => {
    const store = makeStore(fitTree())
    const base = store.getState().past.length
    store.getState().applyPatch("p1", { duration: { basis: 3 * DAY, flex: 2 } })
    const p1 = store.getState().tree.children[0] as VectorSchedule
    expect(p1.duration).toEqual({ basis: 3 * DAY, flex: 2 })
    expect(store.getState().past.length).toBe(base + 1)
  })
})

describe("setBoundsMode (§4.3)", () => {
  it("auto→fixed freezes the derived window as authored bounds", () => {
    const store = makeStore(fitTree())
    store.getState().setBoundsMode("root", { mode: "fixed", frozenWindow: { start: 0, end: 6 * DAY } })
    const root = store.getState().tree
    expect(root.boundsMode).toBe("fixed")
    expect(root.end).toBe(6 * DAY)
  })

  it("fixed→auto drops the authored end", () => {
    const tree = fitTree()
    const fixed: AbsoluteSchedule = { ...tree, boundsMode: "fixed", end: 6 * DAY }
    const store = makeStore(fixed)
    store.getState().setBoundsMode("root", { mode: "auto", frozenWindow: null })
    expect(store.getState().tree.boundsMode).toBe("auto")
    expect(store.getState().tree.end).toBeUndefined()
  })
})

describe("setRecurrence (§5.1)", () => {
  it("sets and clears a rule", () => {
    const store = makeStore(fitTree())
    store.getState().setRecurrence("p2", { frequency: "weekly", interval: 2 })
    expect((store.getState().tree.children[1] as VectorSchedule).recurrence).toEqual({ frequency: "weekly", interval: 2 })
    store.getState().setRecurrence("p2", null)
    expect((store.getState().tree.children[1] as VectorSchedule).recurrence).toBeUndefined()
  })
})

describe("trimNode (§4.5/§8)", () => {
  it("snaps a fixed absolute window to a grid, one undo entry", () => {
    const tree: AbsoluteSchedule = {
      kind: "absolute",
      id: "root",
      start: 0,
      timeContext: { kind: "wallClock" },
      boundsMode: "fixed",
      children: [
        { kind: "absolute", id: "a", start: 1 * HOUR, end: 25 * HOUR, timeContext: { kind: "wallClock" }, boundsMode: "fixed", children: [] },
      ],
    }
    const store = makeStore(tree)
    const base = store.getState().past.length
    store.getState().trimNode("a", { unit: DAY, mode: "nearest", origin: 0 }, "expand")
    const a = store.getState().tree.children[0] as AbsoluteSchedule
    expect(a.start).toBe(0) // floored to day grid
    expect(a.end).toBe(2 * DAY) // ceiled to day grid
    expect(store.getState().past.length).toBe(base + 1)
  })
})
