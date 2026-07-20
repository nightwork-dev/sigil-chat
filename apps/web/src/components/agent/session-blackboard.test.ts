import { describe, expect, it } from "vitest"

import { blackboardEditState } from "./session-blackboard"

describe("session blackboard edit state", () => {
  it("blocks a dirty human draft after an agent update", () => {
    expect(
      blackboardEditState({
        baseContent: "Initial notes",
        baseRevision: "revision-1",
        draft: "My unfinished edit",
        remoteRevision: "revision-2",
      }),
    ).toEqual({ dirty: true, remoteChanged: true, canSave: false })
  })
})
