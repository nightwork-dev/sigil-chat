// Transaction semantics for the PopoverEdit shell. resolveCommitOnClose is the
// single pure decision the shell consults on close: Escape discards the draft;
// a normal close commits it iff it changed. The DOM open/close/focus path is
// exercised in the browser pass; these lock the contract that path depends on.

import { describe, expect, it } from "vitest"

import { resolveCommitOnClose } from "./popover-edit"

describe("resolveCommitOnClose — Escape rolls back", () => {
  it("discards the draft on Escape even when it changed", () => {
    expect(resolveCommitOnClose("escape", 1, 99)).toBeNull()
  })

  it("discards an unchanged draft on Escape too (still no commit)", () => {
    expect(resolveCommitOnClose("escape", 5, 5)).toBeNull()
  })
})

describe("resolveCommitOnClose — close commits", () => {
  it("commits the draft when it differs from the opening value", () => {
    expect(resolveCommitOnClose("commit", 1, 42)).toBe(42)
  })

  it("does not commit when the draft equals the opening value (no spurious change)", () => {
    expect(resolveCommitOnClose("commit", 7, 7)).toBeNull()
  })
})

describe("resolveCommitOnClose — value-type coverage", () => {
  it("commits string drafts that changed", () => {
    expect(resolveCommitOnClose("commit", "a", "b")).toBe("b")
  })

  it("uses Object.is so distinct-but-equal values are treated as unchanged", () => {
    // 0 and -0 are not Object.is-equal; a real edge the contract names.
    expect(resolveCommitOnClose("commit", 0, -0)).not.toBeNull()
    // NaN is Object.is-equal to itself → treated as unchanged.
    expect(resolveCommitOnClose("commit", NaN, NaN)).toBeNull()
  })
})
