// Regression tests for KanbanBoard move resolution.
//
// The index math in resolveBoardMove has regressed THREE times (no-op guard
// swallowing move-to-end; consumer duplicate on same-column; downward drag
// landing one slot too high). These tests exhaustively trace every move class
// so the logic can't silently regress again — each test asserts the exact
// (from, to, newIndex) and, for the directional cases, the final order after a
// faithful consumer reconciliation.

import { describe, expect, it } from "vitest"

import { resolveBoardMove } from "./kanban-board"

// A faithful consumer: remove-then-insert, building the target from the
// FILTERED list when same-column (matches both the showcase and roadmap).
function reconcile(
  columnItems: Record<string, string[]>,
  move: { activeId: string; fromColumnId: string; toColumnId: string; newIndex: number },
): Record<string, string[]> {
  const next = { ...columnItems }
  const without = (next[move.fromColumnId] ?? []).filter((x) => x !== move.activeId)
  if (move.fromColumnId === move.toColumnId) {
    const target = [...without]
    target.splice(move.newIndex, 0, move.activeId)
    next[move.toColumnId] = target
  } else {
    next[move.fromColumnId] = without
    const target = [...(next[move.toColumnId] ?? [])]
    target.splice(move.newIndex, 0, move.activeId)
    next[move.toColumnId] = target
  }
  return next
}

const COL = ["c1", "c2", "c3", "c4"]
const COLUMN_ITEMS = { backlog: [...COL], active: [], done: [] }

function dropOnCard(activeId: string, overId: string, from = "backlog") {
  return resolveBoardMove(
    {
      activeId,
      fromColumnId: from,
      overId,
      overType: "card",
      overColumnId: from,
    },
    COLUMN_ITEMS,
  )
}

function dropOnColumn(activeId: string, overColumnId: string, from = "backlog") {
  return resolveBoardMove(
    {
      activeId,
      fromColumnId: from,
      overId: overColumnId,
      overType: "column",
      overColumnId: undefined,
    },
    COLUMN_ITEMS,
  )
}

describe("resolveBoardMove — same-column reorder", () => {
  it("dragging DOWN lands after the hovered card (not one slot too high)", () => {
    // c1 dragged down onto c3 → should land AFTER c3. This is the exact case
    // that regressed: the naive "insert before hovered" gave [c2,c1,c3,c4].
    const move = dropOnCard("c1", "c3")
    expect(move).toEqual({ activeId: "c1", fromColumnId: "backlog", toColumnId: "backlog", newIndex: 2 })
    const result = reconcile(COLUMN_ITEMS, move!)
    expect(result.backlog).toEqual(["c2", "c3", "c1", "c4"])
  })

  it("dragging DOWN to the last card moves to the end", () => {
    const move = dropOnCard("c1", "c4")
    expect(move?.newIndex).toBe(3)
    expect(reconcile(COLUMN_ITEMS, move!).backlog).toEqual(["c2", "c3", "c4", "c1"])
  })

  it("dragging UP lands before the hovered card", () => {
    // c3 dragged up onto c1 → should land BEFORE c1. Upward moves were never
    // broken; this guards the direction-aware branch from over-correcting them.
    const move = dropOnCard("c3", "c1")
    expect(move?.newIndex).toBe(0)
    expect(reconcile(COLUMN_ITEMS, move!).backlog).toEqual(["c3", "c1", "c2", "c4"])
  })

  it("dragging UP onto a middle card lands before it", () => {
    const move = dropOnCard("c4", "c2")
    expect(move?.newIndex).toBe(1)
    expect(reconcile(COLUMN_ITEMS, move!).backlog).toEqual(["c1", "c4", "c2", "c3"])
  })

  it("swapping adjacent cards (down then up) round-trips", () => {
    const down = reconcile(COLUMN_ITEMS, dropOnCard("c1", "c2")!)
    expect(down.backlog).toEqual(["c2", "c1", "c3", "c4"])
    // Resolve the upward move against the POST-down state, not the stale
    // COLUMN_ITEMS constant — otherwise the direction check sees stale indices.
    const afterDown = { ...COLUMN_ITEMS, backlog: down.backlog }
    const backMove = resolveBoardMove(
      { activeId: "c1", fromColumnId: "backlog", overId: "c2", overType: "card", overColumnId: "backlog" },
      afterDown,
    )
    expect(backMove).not.toBeNull()
    const back = reconcile(afterDown, backMove!)
    expect(back.backlog).toEqual(["c1", "c2", "c3", "c4"])
  })
})

describe("resolveBoardMove — no-ops", () => {
  it("dropping a card back onto itself is a no-op", () => {
    expect(dropOnCard("c2", "c2")).toBeNull()
  })

  it("dropping the last card onto its own column body is a no-op (already last)", () => {
    // c4 is last; dropping it on the backlog column body → targetList.length
    // equals its original index → no-op.
    expect(dropOnColumn("c4", "backlog")).toBeNull()
  })

  it("dropping outside any target is a no-op", () => {
    expect(
      resolveBoardMove(
        { activeId: "c1", fromColumnId: "backlog", overId: null, overType: null, overColumnId: undefined },
        COLUMN_ITEMS,
      ),
    ).toBeNull()
  })
})

describe("resolveBoardMove — move to end", () => {
  it("move-to-end via column body is NOT swallowed (move first card to end)", () => {
    // c1 dropped on the backlog column body → should go to the end, NOT no-op.
    // (The first regression was the no-op guard wrongly swallowing this.)
    const move = dropOnColumn("c1", "backlog")
    expect(move?.newIndex).toBe(3)
    expect(reconcile(COLUMN_ITEMS, move!).backlog).toEqual(["c2", "c3", "c4", "c1"])
  })

  it("move-to-end via column body for a middle card", () => {
    const move = dropOnColumn("c2", "backlog")
    expect(move?.newIndex).toBe(3)
    expect(reconcile(COLUMN_ITEMS, move!).backlog).toEqual(["c1", "c3", "c4", "c2"])
  })
})

describe("resolveBoardMove — cross-column", () => {
  it("moves a card into an empty column at index 0", () => {
    const move = dropOnColumn("c1", "done", "backlog")
    expect(move).toEqual({ activeId: "c1", fromColumnId: "backlog", toColumnId: "done", newIndex: 0 })
    const result = reconcile(COLUMN_ITEMS, move!)
    expect(result.backlog).toEqual(["c2", "c3", "c4"])
    expect(result.done).toEqual(["c1"])
  })

  it("moves the only card out of a column, leaving it empty", () => {
    const items = { backlog: ["x"], done: [] }
    const move = resolveBoardMove(
      { activeId: "x", fromColumnId: "backlog", overId: "done", overType: "column", overColumnId: undefined },
      items,
    )
    expect(move?.newIndex).toBe(0)
    const result = reconcile(items, move!)
    expect(result.backlog).toEqual([])
    expect(result.done).toEqual(["x"])
  })

  it("inserts before the hovered card in the target column (no direction adjust cross-column)", () => {
    const items = { backlog: ["c1"], done: ["c2", "c3", "c4"] }
    const move = resolveBoardMove(
      { activeId: "c1", fromColumnId: "backlog", overId: "c3", overType: "card", overColumnId: "done" },
      items,
    )
    expect(move).toEqual({ activeId: "c1", fromColumnId: "backlog", toColumnId: "done", newIndex: 1 })
    const result = reconcile(items, move!)
    expect(result.done).toEqual(["c2", "c1", "c3", "c4"])
  })
})

describe("resolveBoardMove — invalid inputs", () => {
  it("returns null when fromColumnId is missing", () => {
    expect(
      resolveBoardMove(
        { activeId: "c1", fromColumnId: undefined, overId: "c2", overType: "card", overColumnId: "backlog" },
        COLUMN_ITEMS,
      ),
    ).toBeNull()
  })

  it("returns null when the over card carries no columnId and isn't a column body", () => {
    expect(
      resolveBoardMove(
        { activeId: "c1", fromColumnId: "backlog", overId: "c2", overType: "card", overColumnId: undefined },
        COLUMN_ITEMS,
      ),
    ).toBeNull()
  })
})
