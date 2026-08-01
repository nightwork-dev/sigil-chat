// Progress derivation for QuestLog. The panel's bar, its readout, and the
// trigger's badge all read the same two numbers, so the arithmetic that turns
// them into a percentage is the part worth locking. The popover/DOM path is
// exercised in the browser pass.

import { describe, expect, it } from "vitest"

import { questLogProgress } from "./quest-log"

describe("questLogProgress", () => {
  it("reports the completed share as a rounded percentage", () => {
    expect(questLogProgress(0, 4)).toBe(0)
    expect(questLogProgress(1, 4)).toBe(25)
    expect(questLogProgress(4, 4)).toBe(100)
    expect(questLogProgress(1, 3)).toBe(33)
    expect(questLogProgress(2, 3)).toBe(67)
  })

  // 0% reads as "none done yet" and 100% as "all done"; an empty log is
  // neither, so it gets an indeterminate bar instead of a wrong true-looking
  // one.
  it("has no answer for an empty log", () => {
    expect(questLogProgress(0, 0)).toBeNull()
    expect(questLogProgress(3, 0)).toBeNull()
    expect(questLogProgress(0, -1)).toBeNull()
    expect(questLogProgress(0, Number.NaN)).toBeNull()
  })

  // `completed` comes from a caller's own filtering and can outrun `total` for
  // a frame while data is in flight. A bar past its own track is a rendering
  // bug the component should not be able to produce.
  it("clamps counts outside the track", () => {
    expect(questLogProgress(9, 4)).toBe(100)
    expect(questLogProgress(-2, 4)).toBe(0)
  })
})
