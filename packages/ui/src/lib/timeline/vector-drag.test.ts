// Vector-node move/resize semantics (UI spec §4.4). Unlike store.test.ts's
// absolute-only fixtures, these assert against RESOLVED geometry (resolve()),
// because a vector node's own fields (offset.basis/direction, duration.basis)
// are meaningless without decoding through the alignment chain — the point of
// these tests is "does the bar move where the user dragged it," not "did some
// field change."

import { describe, expect, it } from "vitest"

import { createTimelineStore } from "./store"
import { resolve } from "./schedule"
import type { AbsoluteSchedule, TimeContextProvider, VectorSchedule } from "./schedule"

const HOUR = 3_600_000
const DAY = 86_400_000

const PROVIDER: TimeContextProvider = { currentValue: () => 0 }

/**
 * root (auto) -> p1 [startOfParent, 2d] -> p2 [endOf p1, offset 0 after, 3d]
 * p2 has two children: c1 (vector, startOfParent, offset 1d after, 1d) and
 * abs1 (absolute, fixed times) — used to prove absolute descendants of a
 * moved/resized vector node hold still.
 */
function tree(): AbsoluteSchedule {
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
        duration: { basis: 2 * DAY, flex: 0 },
        boundsMode: "fixed",
        payload: { type: "phase", data: {} },
        children: [],
      },
      {
        kind: "vector",
        id: "p2",
        alignment: { kind: "endOf", siblingId: "p1" },
        offset: { basis: 0, direction: "after", flex: 0 },
        duration: { basis: 3 * DAY, flex: 0 },
        boundsMode: "fixed",
        payload: { type: "phase", data: {} },
        children: [
          {
            kind: "vector",
            id: "c1",
            alignment: { kind: "startOfParent" },
            offset: { basis: 1 * DAY, direction: "after", flex: 0 },
            duration: { basis: 1 * DAY, flex: 0 },
            boundsMode: "fixed",
            payload: { type: "sub", data: {} },
            children: [],
          },
          {
            kind: "absolute",
            id: "abs1",
            start: 100 * DAY,
            end: 101 * DAY,
            timeContext: { kind: "wallClock" },
            boundsMode: "fixed",
            payload: { type: "note", data: {} },
            children: [],
          },
        ],
      },
    ],
  }
}

function makeStore(t: AbsoluteSchedule = tree()) {
  return createTimelineStore({ tree: t, viewStart: -DAY, viewEnd: 20 * DAY })
}

function resolvedOf(root: AbsoluteSchedule, id: string) {
  const resolved = resolve(root, PROVIDER)
  const stack = [resolved]
  while (stack.length) {
    const node = stack.pop()!
    if (node.id === id) return node
    stack.push(...node.children)
  }
  throw new Error(`${id} not found`)
}

describe("vector move (§4.4 semantic 1)", () => {
  it("shifts resolvedStart/resolvedEnd by the drag delta", () => {
    const store = makeStore()
    const before = resolvedOf(store.getState().tree, "p2")
    store.getState().moveEvent("p2", 5 * HOUR)
    const after = resolvedOf(store.getState().tree, "p2")
    expect(after.resolvedStart).toBe(before.resolvedStart + 5 * HOUR)
    expect(after.resolvedEnd).toBe(before.resolvedEnd! + 5 * HOUR)
  })

  it("moveEventCascade on a vector node behaves the same as moveEvent (offset-only)", () => {
    const store = makeStore()
    const before = resolvedOf(store.getState().tree, "p2")
    store.getState().moveEventCascade("p2", 5 * HOUR)
    const after = resolvedOf(store.getState().tree, "p2")
    expect(after.resolvedStart).toBe(before.resolvedStart + 5 * HOUR)
  })

  it("moves vector-aligned descendants along (they auto-follow via resolve, not an explicit shift)", () => {
    const store = makeStore()
    const beforeC1 = resolvedOf(store.getState().tree, "c1")
    store.getState().moveEvent("p2", 5 * HOUR)
    const afterC1 = resolvedOf(store.getState().tree, "c1")
    expect(afterC1.resolvedStart).toBe(beforeC1.resolvedStart + 5 * HOUR)
  })

  it("does NOT shift absolute descendants — they'd double-move otherwise", () => {
    const store = makeStore()
    const beforeAbs = resolvedOf(store.getState().tree, "abs1")
    store.getState().moveEvent("p2", 5 * HOUR)
    const afterAbs = resolvedOf(store.getState().tree, "abs1")
    expect(afterAbs.resolvedStart).toBe(beforeAbs.resolvedStart)
    expect(afterAbs.resolvedEnd).toBe(beforeAbs.resolvedEnd)
    // Source data confirms no field was rewritten either.
    const abs1 = (store.getState().tree.children[1].children[1]) as AbsoluteSchedule
    expect(abs1.start).toBe(100 * DAY)
    expect(abs1.end).toBe(101 * DAY)
  })

  it("drag across the anchor flips direction at zero, never clamps", () => {
    const store = makeStore()
    const p1End = resolvedOf(store.getState().tree, "p1").resolvedEnd!
    // p2 starts at endOf(p1) + 0. Drag it 5h before that anchor.
    store.getState().moveEvent("p2", -5 * HOUR)
    const p2 = store.getState().tree.children[1] as VectorSchedule
    expect(p2.offset.direction).toBe("before")
    expect(p2.offset.basis).toBe(5 * HOUR)
    expect(p2.offset.basis).toBeGreaterThanOrEqual(0) // magnitude never negative
    const resolvedP2 = resolvedOf(store.getState().tree, "p2")
    expect(resolvedP2.resolvedStart).toBe(p1End - 5 * HOUR) // no clamp at the anchor
  })

  it("dragging back across zero flips direction back to after", () => {
    const store = makeStore()
    store.getState().moveEvent("p2", -5 * HOUR) // now "before", basis 5h
    store.getState().moveEvent("p2", 8 * HOUR) // net +3h past the anchor
    const p2 = store.getState().tree.children[1] as VectorSchedule
    expect(p2.offset.direction).toBe("after")
    expect(p2.offset.basis).toBe(3 * HOUR)
  })
})

describe("vector resize end (§4.4 semantic 2)", () => {
  it("moves resolvedEnd only, resolvedStart untouched", () => {
    const store = makeStore()
    const before = resolvedOf(store.getState().tree, "p2")
    store.getState().resizeEvent("p2", "end", 4 * HOUR)
    const after = resolvedOf(store.getState().tree, "p2")
    expect(after.resolvedStart).toBe(before.resolvedStart)
    expect(after.resolvedEnd).toBe(before.resolvedEnd! + 4 * HOUR)
  })

  it("floors at max(min ?? 0, epsilon) — never zero, never inverted", () => {
    const store = makeStore()
    store.getState().resizeEvent("p2", "end", -10 * DAY, HOUR) // way past zero
    const p2 = store.getState().tree.children[1] as VectorSchedule
    expect(p2.duration.basis).toBeGreaterThanOrEqual(HOUR)
    const resolvedP2 = resolvedOf(store.getState().tree, "p2")
    expect(resolvedP2.resolvedEnd!).toBeGreaterThan(resolvedP2.resolvedStart)
  })
})

describe("vector resize start (§4.4 semantic 3)", () => {
  it("moves resolvedStart only, resolvedEnd stays fixed", () => {
    const store = makeStore()
    const before = resolvedOf(store.getState().tree, "p2")
    store.getState().resizeEvent("p2", "start", 6 * HOUR)
    const after = resolvedOf(store.getState().tree, "p2")
    expect(after.resolvedStart).toBe(before.resolvedStart + 6 * HOUR)
    expect(after.resolvedEnd).toBe(before.resolvedEnd) // unchanged
  })

  it("shrinking the start edge floors duration and stops absorbing further delta", () => {
    const store = makeStore()
    const before = resolvedOf(store.getState().tree, "p2") // duration 3d
    store.getState().resizeEvent("p2", "start", 10 * DAY, HOUR) // way past the floor
    const p2 = store.getState().tree.children[1] as VectorSchedule
    expect(p2.duration.basis).toBeGreaterThanOrEqual(HOUR)
    const after = resolvedOf(store.getState().tree, "p2")
    expect(after.resolvedEnd).toBe(before.resolvedEnd) // still hasn't moved despite the floor
  })
})

describe("quantum precedence on authored writes (§1.1(1)/§2.5)", () => {
  function quantumTree(): AbsoluteSchedule {
    const t = tree()
    const p2 = t.children[1] as VectorSchedule
    return {
      ...t,
      children: [
        t.children[0],
        { ...p2, duration: { ...p2.duration, basis: 24 * HOUR, quantum: { unit: 6 * HOUR, mode: "floor" } } },
      ],
    }
  }

  it("end-resize snaps the authored duration.basis to the node's quantum grid", () => {
    const store = makeStore(quantumTree())
    store.getState().resizeEvent("p2", "end", 8 * HOUR) // 24h + 8h = 32h -> floors to 30h (6h grid)
    const p2 = store.getState().tree.children[1] as VectorSchedule
    expect(p2.duration.basis % (6 * HOUR)).toBe(0)
    expect(p2.duration.basis).toBe(30 * HOUR)
  })

  it("a drag smaller than the quantum unit legitimately no-ops", () => {
    const store = makeStore(quantumTree())
    store.getState().resizeEvent("p2", "end", 2 * HOUR) // 24h + 2h = 26h -> floors back to 24h
    const p2 = store.getState().tree.children[1] as VectorSchedule
    expect(p2.duration.basis).toBe(24 * HOUR)
  })

  it("start-resize on a quantum duration stays on-grid; independent snapping may drift the held end", () => {
    // The documented resizeVectorStart caveat: offset (no quantum) absorbs the
    // full 8h delta, but duration 24h-8h=16h floors to 12h on the 6h grid, so
    // the "held" end drifts earlier by the 4h snap residue. This pins both the
    // on-grid guarantee (§2.5, the hard rule) and the exact drift (the known
    // soft spot) so any change to either surfaces here.
    const store = makeStore(quantumTree())
    const before = resolvedOf(store.getState().tree, "p2")
    store.getState().resizeEvent("p2", "start", 8 * HOUR)
    const p2 = store.getState().tree.children[1] as VectorSchedule
    expect(p2.offset.basis).toBe(8 * HOUR)
    expect(p2.offset.direction).toBe("after")
    expect(p2.duration.basis).toBe(12 * HOUR)
    expect(p2.duration.basis % (6 * HOUR)).toBe(0)
    const after = resolvedOf(store.getState().tree, "p2")
    expect(after.resolvedStart).toBe(before.resolvedStart + 8 * HOUR)
    expect(after.resolvedEnd).toBe(before.resolvedEnd! - 4 * HOUR) // snap-residue drift
  })
})

describe("undo (§7)", () => {
  it("one drag gesture (move) is one undo entry, and undo reverts the whole vector move", () => {
    const store = makeStore()
    const basePast = store.getState().past.length
    const beforeTree = store.getState().tree
    store.getState().moveEvent("p2", 1 * HOUR)
    store.getState().moveEvent("p2", 1 * HOUR)
    store.getState().moveEvent("p2", 1 * HOUR)
    expect(store.getState().past.length).toBe(basePast + 1) // coalesced into one entry
    store.getState().undo()
    expect(store.getState().tree).toBe(beforeTree)
  })

  it("one resize gesture is one undo entry", () => {
    const store = makeStore()
    const basePast = store.getState().past.length
    store.getState().resizeEvent("p2", "end", 1 * HOUR)
    store.getState().resizeEvent("p2", "end", 1 * HOUR)
    expect(store.getState().past.length).toBe(basePast + 1)
  })
})
