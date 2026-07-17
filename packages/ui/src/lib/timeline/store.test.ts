// Store migration unit tests (US-008). Exercise the structural clamp, undo/redo
// round-trips per operation, legacy import shape, and override write+undo.
// Render derivation runs the live engine resolve() — the boundsStatus
// assertions below ("conflicting"/"bounded") depend on the real bounds solve.

import { describe, expect, it } from "vitest"

import type { AbsoluteSchedule } from "./schedule"
import { createTimelineStore, importLegacyEvents, selectEvents, selectMeta, selectRelationships } from "./store"
import type { TimelineEvent, TimelineRelationship } from "./types"

function range(id: string, startTime: number, endTime: number, extra: Partial<TimelineEvent> = {}): TimelineEvent {
  return { id, title: id, type: "range", startTime, endTime, ...extra } as TimelineEvent
}
function instant(id: string, timestamp: number, extra: Partial<TimelineEvent> = {}): TimelineEvent {
  return { id, title: id, type: "instantaneous", timestamp, ...extra } as TimelineEvent
}

function makeStore(events: TimelineEvent[], relationships?: Record<string, TimelineRelationship>) {
  return createTimelineStore({ events, viewStart: 0, viewEnd: 100_000, relationships })
}

/** Flat events, derived through the memoized selector — the shape consumers see. */
function events(store: ReturnType<typeof makeStore>) {
  return selectEvents(store.getState())
}

describe("importLegacyEvents", () => {
  it("wraps flat events in a single rigid absolute root, preserving id/title/color", () => {
    const tree = importLegacyEvents([
      range("a", 0, 1000, { title: "Alpha", color: "#f00" }),
      instant("b", 500, { title: "Beta" }),
    ])
    expect(tree.kind).toBe("absolute")
    expect(tree.boundsMode).toBe("fixed")
    expect(tree.children.map((c) => c.id).sort()).toEqual(["a", "b"])
    const a = tree.children.find((c) => c.id === "a")!
    expect(a.kind).toBe("absolute")
    expect(a.boundsMode).toBe("fixed")
    expect(a.payload?.data).toMatchObject({ title: "Alpha", color: "#f00" })
    // No inferred vector relationships (§8): every node is absolute.
    expect(tree.children.every((c) => c.kind === "absolute")).toBe(true)
  })

  it("nests children under parents per the relationships map", () => {
    const tree = importLegacyEvents(
      [range("p", 0, 1000), range("c", 200, 400)],
      { p: { childIds: ["c"] }, c: { parentId: "p", childIds: [] } },
    )
    expect(tree.children.map((c) => c.id)).toEqual(["p"]) // c is nested, not top level
    const p = tree.children[0]
    expect(p.children.map((c) => c.id)).toEqual(["c"])
  })

  it("round-trips back through the selector to shape-compatible flat events", () => {
    const store = makeStore([range("a", 0, 1000, { color: "#0f0" }), instant("b", 500)])
    const flat = events(store)
    expect(flat.a).toMatchObject({ id: "a", type: "range", startTime: 0, endTime: 1000, color: "#0f0" })
    expect(flat.b).toMatchObject({ id: "b", type: "instantaneous", timestamp: 500 })
    const rels = selectRelationships(store.getState())
    expect(rels.a.parentId).toBeUndefined()
  })

  it("promotes cycle-trapped events to top level instead of dropping them", () => {
    const tree = importLegacyEvents(
      [range("x", 0, 1000), range("y", 0, 1000)],
      { x: { childIds: ["y"] }, y: { childIds: ["x"] } },
    )
    const ids = new Set<string>()
    const walk = (n: typeof tree) => n.children.forEach((c) => { ids.add(c.id); walk(c as typeof tree) })
    walk(tree)
    expect(ids.has("x")).toBe(true)
    expect(ids.has("y")).toBe(true)
  })
})

describe("structural clamp (§1.3)", () => {
  it("resize-end cannot shrink duration below the epsilon floor", () => {
    const store = makeStore([range("a", 0, 10_000)])
    store.getState().resizeEvent("a", "end", -1_000_000) // yank the end far past the start
    const a = events(store).a
    expect(a.type).toBe("range")
    if (a.type === "range") {
      expect(a.endTime).toBe(1000) // start(0) + default epsilon(1000)
      expect(a.endTime - a.startTime).toBeGreaterThanOrEqual(1000)
    }
  })

  it("resize-start cannot cross the end (no inversion)", () => {
    const store = makeStore([range("a", 0, 10_000)])
    store.getState().resizeEvent("a", "start", 1_000_000)
    const a = events(store).a
    if (a.type === "range") {
      expect(a.startTime).toBe(9000) // end(10000) - epsilon(1000)
      expect(a.startTime).toBeLessThan(a.endTime)
    }
  })

  it("honors a caller-supplied epsilon (ambient grid unit)", () => {
    const store = makeStore([range("a", 0, 100_000)])
    store.getState().resizeEvent("a", "end", -1_000_000, 5000)
    const a = events(store).a
    if (a.type === "range") expect(a.endTime).toBe(5000)
  })

  it("resize never event-ifies — the flat item stays a range", () => {
    const store = makeStore([range("a", 0, 10_000)])
    store.getState().resizeEvent("a", "end", -1_000_000)
    expect(events(store).a.type).toBe("range")
  })

  it("event-ification (duration 0) is reachable only via setEventDuration", () => {
    const store = makeStore([range("a", 0, 10_000)])
    store.getState().setEventDuration("a", 0)
    expect(events(store).a.type).toBe("instantaneous")
    // and back to a range with an explicit positive duration
    store.getState().setEventDuration("a", 4000)
    const a = events(store).a
    expect(a.type).toBe("range")
    if (a.type === "range") expect(a.endTime - a.startTime).toBe(4000)
  })
})

describe("move semantics", () => {
  it("moveEventCascade shifts the node and its descendants by the same delta", () => {
    const store = makeStore(
      [range("p", 0, 1000), range("c", 200, 400)],
      { p: { childIds: ["c"] }, c: { parentId: "p", childIds: [] } },
    )
    store.getState().moveEventCascade("p", 5000)
    const flat = events(store)
    expect(flat.p).toMatchObject({ startTime: 5000, endTime: 6000 })
    expect(flat.c).toMatchObject({ startTime: 5200, endTime: 5400 })
  })

  it("moveEvent shifts only the node, leaving descendants put", () => {
    const store = makeStore(
      [range("p", 0, 1000), range("c", 200, 400)],
      { p: { childIds: ["c"] }, c: { parentId: "p", childIds: [] } },
    )
    store.getState().moveEvent("p", 5000)
    const flat = events(store)
    expect(flat.p).toMatchObject({ startTime: 5000, endTime: 6000 })
    expect(flat.c).toMatchObject({ startTime: 200, endTime: 400 })
  })
})

describe("undo / redo round-trips", () => {
  function snapshot(store: ReturnType<typeof makeStore>) {
    return JSON.stringify(events(store))
  }

  it("addEvent", () => {
    const store = makeStore([range("a", 0, 1000)])
    const before = snapshot(store)
    store.getState().addEvent(range("b", 2000, 3000))
    const after = snapshot(store)
    expect(after).not.toBe(before)
    store.getState().undo()
    expect(snapshot(store)).toBe(before)
    store.getState().redo()
    expect(snapshot(store)).toBe(after)
  })

  it("updateEvent (inspector edit)", () => {
    const store = makeStore([range("a", 0, 1000, { title: "Alpha" })])
    const before = snapshot(store)
    store.getState().updateEvent("a", { title: "Renamed" })
    expect(events(store).a.title).toBe("Renamed")
    store.getState().undo()
    expect(snapshot(store)).toBe(before)
    expect(events(store).a.title).toBe("Alpha")
    store.getState().redo()
    expect(events(store).a.title).toBe("Renamed")
  })

  it("deleteEvent", () => {
    const store = makeStore([range("a", 0, 1000), range("b", 2000, 3000)])
    const before = snapshot(store)
    store.getState().deleteEvent("b")
    expect(events(store).b).toBeUndefined()
    store.getState().undo()
    expect(snapshot(store)).toBe(before)
  })

  it("moveEventCascade", () => {
    const store = makeStore([range("a", 0, 1000)])
    const before = snapshot(store)
    store.getState().moveEventCascade("a", 5000)
    const after = snapshot(store)
    store.getState().undo()
    expect(snapshot(store)).toBe(before)
    store.getState().redo()
    expect(snapshot(store)).toBe(after)
  })

  it("resizeEvent", () => {
    const store = makeStore([range("a", 0, 10_000)])
    const before = snapshot(store)
    store.getState().resizeEvent("a", "end", -2000)
    store.getState().undo()
    expect(snapshot(store)).toBe(before)
  })

  it("setEventDuration (bounds/event toggle)", () => {
    const store = makeStore([range("a", 0, 10_000)])
    const before = snapshot(store)
    store.getState().setEventDuration("a", 0)
    expect(events(store).a.type).toBe("instantaneous")
    store.getState().undo()
    expect(snapshot(store)).toBe(before)
    expect(events(store).a.type).toBe("range")
  })

  it("setParent", () => {
    const store = makeStore([range("a", 0, 1000), range("b", 2000, 3000)])
    const before = JSON.stringify(selectRelationships(store.getState()))
    store.getState().setParent("b", "a")
    expect(selectRelationships(store.getState()).b.parentId).toBe("a")
    store.getState().undo()
    expect(JSON.stringify(selectRelationships(store.getState()))).toBe(before)
  })

  it("writeOverride + undo of it", () => {
    const store = makeStore([range("a", 0, 1000)])
    expect(store.getState().overrides.size).toBe(0)
    store.getState().writeOverride("a", 3, { start: 9999 })
    expect(store.getState().overrides.get("a:3")).toEqual({ start: 9999 })
    store.getState().undo()
    expect(store.getState().overrides.size).toBe(0)
    store.getState().redo()
    expect(store.getState().overrides.get("a:3")).toEqual({ start: 9999 })
  })

  it("undo on an empty history is a no-op", () => {
    const store = makeStore([range("a", 0, 1000)])
    const before = snapshot(store)
    store.getState().undo()
    store.getState().redo()
    expect(snapshot(store)).toBe(before)
  })
})

describe("history coalescing", () => {
  it("a run of same-target moves folds into ONE undo entry (a drag is one step)", () => {
    const store = makeStore([range("a", 0, 1000)])
    const before = JSON.stringify(events(store))
    store.getState().moveEventCascade("a", 100)
    store.getState().moveEventCascade("a", 100)
    store.getState().moveEventCascade("a", 100)
    expect(store.getState().past).toHaveLength(1)
    const a = events(store).a
    if (a.type === "range") expect(a.startTime).toBe(300)
    store.getState().undo()
    expect(JSON.stringify(events(store))).toBe(before)
  })

  it("a different operation breaks the coalescing run", () => {
    const store = makeStore([range("a", 0, 1000), range("b", 0, 1000)])
    store.getState().moveEventCascade("a", 100)
    store.getState().moveEventCascade("b", 100) // different target → new entry
    expect(store.getState().past).toHaveLength(2)
  })

  it("caps history depth at 100", () => {
    const store = makeStore([range("a", 0, 1000)])
    for (let i = 0; i < 150; i++) store.getState().addEvent(range(`e${i}`, i, i + 1))
    expect(store.getState().past.length).toBeLessThanOrEqual(100)
  })
})

describe("render meta selector (§2)", () => {
  it("flags a child that overruns its fixed parent as conflicting, with the overrun magnitude and edge", () => {
    const store = makeStore(
      [range("p", 0, 1000), range("c", 500, 1500)],
      { p: { childIds: ["c"] }, c: { parentId: "p", childIds: [] } },
    )
    const meta = selectMeta(store.getState())
    expect(meta.c.boundsStatus).toBe("conflicting")
    expect(meta.c.conflict?.edge).toBe("end")
    expect(meta.c.conflict?.overrun).toBe(500)
    // Legacy import is all-fixed/absolute — nothing is a computed (auto) window yet.
    expect(meta.c.provenance).toBe("pinned")
    expect(meta.c.quantumMs).toBeUndefined()
  })

  it("reads a child fully inside its parent as bounded, not conflicting", () => {
    const store = makeStore(
      [range("p", 0, 1000), range("c", 200, 400)],
      { p: { childIds: ["c"] }, c: { parentId: "p", childIds: [] } },
    )
    const meta = selectMeta(store.getState())
    expect(meta.c.boundsStatus).toBe("bounded")
    expect(meta.c.conflict).toBeUndefined()
  })

  it("carries the engine's isEvent flag — true for a zero-width window, false for a spanning range", () => {
    // isEvent is the engine's "duration basis === 0" (a zero-WIDTH window,
    // end === start), not "renders as a point": a legacy instant imports with
    // end: undefined (indefinite), which the resolver reports as isEvent:false
    // while still resolving to an instantaneous marker.
    const store = makeStore([range("z", 500, 500), range("r", 0, 1000)])
    const meta = selectMeta(store.getState())
    expect(meta.z.isEvent).toBe(true)
    expect(meta.r.isEvent).toBe(false)
  })

  it("recomputes conflict live when a resize pushes a child past the parent edge (§2.1 during-drag)", () => {
    const store = makeStore(
      [range("p", 0, 1000), range("c", 200, 400)],
      { p: { childIds: ["c"] }, c: { parentId: "p", childIds: [] } },
    )
    expect(selectMeta(store.getState()).c.boundsStatus).toBe("bounded")
    store.getState().resizeEvent("c", "end", 2000) // c now 200..2400, past p's end at 1000
    const meta = selectMeta(store.getState())
    expect(meta.c.boundsStatus).toBe("conflicting")
    expect(meta.c.conflict?.edge).toBe("end")
    expect(meta.c.conflict?.overrun).toBe(1400)
  })
})

// ─── Occurrence-0 fold into the derived flat list (§5.2) ────────────────────
// The flat list carries the FOCUSED occurrence (index 0) of each node, folding
// its override — the base bar a consumer draws. Occurrences 1..N stay the
// separate shadow projection (shadows.ts), so the flat list never gains an event
// per occurrence.

const HOUR = 3_600_000
const DAY = 86_400_000

/** A weekly recurring range window, `count` occurrences, 4h wide, starting at t=0. */
function weeklySeriesTree(count: number): AbsoluteSchedule {
  return {
    kind: "absolute",
    id: "root",
    start: 0,
    timeContext: { kind: "wallClock" },
    boundsMode: "fixed",
    payload: { type: "group", data: {} },
    children: [
      {
        kind: "absolute",
        id: "series",
        start: 0,
        end: 4 * HOUR,
        timeContext: { kind: "wallClock" },
        boundsMode: "fixed",
        recurrence: { frequency: "weekly", interval: 1, count },
        payload: { type: "liveops", data: { title: "Series" } },
        children: [],
      },
    ],
  }
}

function recurringStore(count = 4) {
  return createTimelineStore({ tree: weeklySeriesTree(count), viewStart: -DAY, viewEnd: 40 * DAY })
}

describe("occurrence-0 override folds into the derived flat list (§5.2)", () => {
  it("a start override moves the focused occurrence's flat event, preserving duration", () => {
    const store = recurringStore()
    const before = selectEvents(store.getState()).series
    expect(before).toEqual({ id: "series", title: "Series", type: "range", startTime: 0, endTime: 4 * HOUR })
    store.getState().moveOccurrence("series", 0, 12 * HOUR)
    const after = selectEvents(store.getState()).series
    // Moved start, same 4h duration.
    expect(after).toEqual({ id: "series", title: "Series", type: "range", startTime: 12 * HOUR, endTime: 16 * HOUR })
  })

  it("a duration override resizes the focused occurrence's flat event", () => {
    const store = recurringStore()
    store.getState().writeOverride("series", 0, { duration: 2 * HOUR })
    expect(selectEvents(store.getState()).series).toEqual({ id: "series", title: "Series", type: "range", startTime: 0, endTime: 2 * HOUR })
  })

  it("a cancel of the focused occurrence flags meta but keeps the flat event present", () => {
    const store = recurringStore()
    store.getState().cancelOccurrence("series", 0, true)
    // Event still there (base bar stays, shadow anchor intact) — not dropped.
    expect(selectEvents(store.getState()).series).toBeDefined()
    expect(selectMeta(store.getState()).series.cancelled).toBe(true)
    store.getState().cancelOccurrence("series", 0, false)
    expect(selectMeta(store.getState()).series.cancelled).toBe(false)
  })

  it("does not double-render: the flat list holds exactly one event per node regardless of occurrence count", () => {
    const store = recurringStore(30)
    const ids = Object.keys(selectEvents(store.getState()))
    // root's children are flattened; the recurring node appears once, not 30×.
    expect(ids).toEqual(["series"])
  })

  it("an override on a NON-index-0 occurrence does not touch the flat event (that's a shadow)", () => {
    const store = recurringStore()
    const before = selectEvents(store.getState()).series
    store.getState().moveOccurrence("series", 2, 20 * DAY)
    expect(selectEvents(store.getState()).series).toEqual(before)
  })
})

describe("render memoization keys on (tree, overrides) (§8 cache fix)", () => {
  it("returns an identical reference for unchanged state", () => {
    const store = recurringStore()
    expect(selectEvents(store.getState())).toBe(selectEvents(store.getState()))
    expect(selectMeta(store.getState())).toBe(selectMeta(store.getState()))
  })

  it("returns a NEW reference after an override write on the same tree (no stale cache)", () => {
    const store = recurringStore()
    const treeBefore = store.getState().tree
    const eventsBefore = selectEvents(store.getState())
    store.getState().moveOccurrence("series", 0, 12 * HOUR)
    // Same tree identity — only the overrides map changed.
    expect(store.getState().tree).toBe(treeBefore)
    const eventsAfter = selectEvents(store.getState())
    expect(eventsAfter).not.toBe(eventsBefore)
    // And the new derivation reflects the override, not a stale same-tree entry.
    expect(eventsAfter.series.type === "range" && eventsAfter.series.startTime).toBe(12 * HOUR)
  })

  it("undo restores the pre-override flat event", () => {
    const store = recurringStore()
    store.getState().moveOccurrence("series", 0, 12 * HOUR)
    store.getState().undo()
    expect(selectEvents(store.getState()).series).toEqual({ id: "series", title: "Series", type: "range", startTime: 0, endTime: 4 * HOUR })
  })
})
