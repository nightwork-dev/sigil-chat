import { describe, expect, it } from "vitest"

import { GestureDwell } from "./gestures"

describe("gesture dwell", () => {
  it("never confirms a single frame", () => {
    const dwell = new GestureDwell(600)
    expect(dwell.update("open-palm", 0).confirmed).toBeNull()
    expect(dwell.update(null, 16).confirmed).toBeNull()
  })

  it("confirms once after a stable dwell and rearms after neutral", () => {
    const dwell = new GestureDwell(600)
    dwell.update("thumbs-up", 0)
    expect(dwell.update("thumbs-up", 599).confirmed).toBeNull()
    expect(dwell.update("thumbs-up", 600).confirmed).toBe("thumbs-up")
    expect(dwell.update("thumbs-up", 900).confirmed).toBeNull()
    dwell.update(null, 901)
    dwell.update("thumbs-up", 1_000)
    expect(dwell.update("thumbs-up", 1_600).confirmed).toBe("thumbs-up")
  })
})
