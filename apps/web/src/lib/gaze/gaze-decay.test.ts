import { describe, expect, it } from "vitest"

import {
  advanceGazeDecay,
  GAZE_ATTENTION_DECAY_MS,
  initialGazeDecayState,
} from "./gaze-decay"
import type { GazeRegionDescriptor } from "./gaze-region"

const X: GazeRegionDescriptor = { id: "card-alpha", label: "Card Alpha" }
const Y: GazeRegionDescriptor = { id: "card-beta", label: "Card Beta" }

describe("advanceGazeDecay", () => {
  it("carries a live region and refreshes its clock", () => {
    const seen = advanceGazeDecay(initialGazeDecayState(), X, 1000)
    expect(seen.region?.id).toBe(X.id)
    expect(seen.lastSeenAt).toBe(1000)
  })

  it("holds the region through a look-away until the window elapses", () => {
    const seen = advanceGazeDecay(initialGazeDecayState(), X, 1000)
    // Gaze leaves X; still inside the window → region retained.
    const within = advanceGazeDecay(
      seen,
      null,
      1000 + GAZE_ATTENTION_DECAY_MS - 1,
    )
    expect(within.region?.id).toBe(X.id)
    // Window elapses with no new gaze → cleared.
    const after = advanceGazeDecay(within, null, 1000 + GAZE_ATTENTION_DECAY_MS)
    expect(after.region).toBeNull()
  })

  it("a new region during the window replaces the held one and resets the clock", () => {
    const seen = advanceGazeDecay(initialGazeDecayState(), X, 1000)
    const midWindow = 1000 + GAZE_ATTENTION_DECAY_MS - 10
    const moved = advanceGazeDecay(seen, Y, midWindow)
    expect(moved.region?.id).toBe(Y.id)
    expect(moved.lastSeenAt).toBe(midWindow)
    // Y now gets its own full window, measured from when it was seen.
    const stillY = advanceGazeDecay(
      moved,
      null,
      midWindow + GAZE_ATTENTION_DECAY_MS - 1,
    )
    expect(stillY.region?.id).toBe(Y.id)
  })

  it("is stable once cleared", () => {
    const cleared = advanceGazeDecay(initialGazeDecayState(), null, 5000)
    expect(cleared.region).toBeNull()
    const stillCleared = advanceGazeDecay(cleared, null, 9999)
    expect(stillCleared.region).toBeNull()
  })
})
