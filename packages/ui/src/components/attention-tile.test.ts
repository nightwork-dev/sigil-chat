// The projection contract behind <AttentionTile>: a count renders ONLY when
// live AND non-null, and the composed accessible name follows the state. The
// component is a thin render layer over these two pure helpers; locking them
// here in node (per the repo's extract-the-math convention) is what keeps a
// stale number from ever leaking into the empty or loading state.

import { describe, expect, it } from "vitest"

import { composeAccessibleName, shouldShowCount, type AttentionState } from "../components/attention-tile"

describe("shouldShowCount — the projection contract", () => {
  it("shows a non-null count in the live state", () => {
    expect(shouldShowCount("live", 0)).toBe(true)
    expect(shouldShowCount("live", 3)).toBe(true)
  })
  it("hides the count in empty and loading regardless of value", () => {
    expect(shouldShowCount("empty", 3)).toBe(false)
    expect(shouldShowCount("loading", 3)).toBe(false)
  })
  it("hides a null/undefined count in every state, including live", () => {
    expect(shouldShowCount("live", null)).toBe(false)
    expect(shouldShowCount("live", undefined)).toBe(false)
    expect(shouldShowCount("empty", null)).toBe(false)
    expect(shouldShowCount("loading", undefined)).toBe(false)
  })
  it("rejects a negative count (no invented or garbage numbers)", () => {
    expect(shouldShowCount("live", -1)).toBe(false)
  })
})

describe("composeAccessibleName", () => {
  const title = "Inbox"

  it("announces the count for a live tile with items", () => {
    expect(composeAccessibleName(title, "live", 3)).toBe("Inbox, 3 items")
  })
  it("uses the singular form for exactly one item", () => {
    expect(composeAccessibleName(title, "live", 1)).toBe("Inbox, 1 item")
  })
  it("omits the count from the name when live but count is null", () => {
    expect(composeAccessibleName(title, "live", null)).toBe("Inbox")
    expect(composeAccessibleName(title, "live", undefined)).toBe("Inbox")
  })
  it("announces 'nothing waiting' for the empty state — never a count", () => {
    expect(composeAccessibleName(title, "empty", 5)).toBe("Inbox, nothing waiting")
    expect(composeAccessibleName(title, "empty", null)).toBe("Inbox, nothing waiting")
  })
  it("announces 'loading' for the loading state — never a count", () => {
    expect(composeAccessibleName(title, "loading", 5)).toBe("Inbox, loading")
    expect(composeAccessibleName(title, "loading", null)).toBe("Inbox, loading")
  })
  it("covers every state", () => {
    const states: AttentionState[] = ["live", "empty", "loading"]
    for (const state of states) {
      expect(typeof composeAccessibleName(title, state, 1)).toBe("string")
    }
  })
})
