// Selection logic for PillBar. The bar is controlled, so the reducer decides
// which ToggleGroup value changes become onSelect() calls and which are
// no-ops (toggle-off / re-select of the current id). The DOM scroll/fade path
// is exercised in the browser pass.

import { describe, expect, it } from "vitest"

import { resolvePillSelect } from "./pill-bar"

describe("resolvePillSelect", () => {
  it("selects a newly-pressed item", () => {
    expect(resolvePillSelect("a", ["b"])).toBe("b")
    expect(resolvePillSelect(undefined, ["c"])).toBe("c")
  })

  it("ignores a toggle-off (empty group value) so the controlled pill holds", () => {
    expect(resolvePillSelect("a", [])).toBeNull()
  })

  it("treats re-selecting the current id as a no-op (idempotent)", () => {
    expect(resolvePillSelect("a", ["a"])).toBeNull()
  })

  it("takes the last value when the group emits more than one", () => {
    expect(resolvePillSelect("a", ["b", "c"])).toBe("c")
  })
})
