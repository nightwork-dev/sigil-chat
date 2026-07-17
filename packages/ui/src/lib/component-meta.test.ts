import { afterEach, describe, expect, it } from "vitest"

import { COMPONENT_META, isNew } from "./component-meta"

const referenceIso = "2026-07-08T12:00:00.000Z"
const testNames = ["__test_in_window", "__test_out_of_window", "__test_boundary", "__test_invalid"]

afterEach(() => {
  for (const name of testNames) {
    delete COMPONENT_META[name]
  }
})

describe("isNew", () => {
  it("returns true when addedAt is inside the 24-hour new window", () => {
    COMPONENT_META.__test_in_window = { addedAt: "2026-07-08T00:00:00.000Z" }

    expect(isNew("__test_in_window", referenceIso)).toBe(true)
  })

  it("returns false when addedAt is outside the 24-hour new window", () => {
    COMPONENT_META.__test_out_of_window = { addedAt: "2026-07-07T00:00:00.000Z" }

    expect(isNew("__test_out_of_window", referenceIso)).toBe(false)
  })

  it("includes the exact NEW_WINDOW_HOURS boundary", () => {
    COMPONENT_META.__test_boundary = { addedAt: "2026-07-07T12:00:00.000Z" }

    expect(isNew("__test_boundary", referenceIso)).toBe(true)
  })

  it("returns false for unknown component names", () => {
    expect(isNew("__test_missing", referenceIso)).toBe(false)
  })

  it("returns false for invalid timestamps", () => {
    COMPONENT_META.__test_invalid = { addedAt: "not-a-date" }

    expect(isNew("__test_invalid", referenceIso)).toBe(false)
    expect(isNew("__test_invalid", "not-a-date")).toBe(false)
  })
})
