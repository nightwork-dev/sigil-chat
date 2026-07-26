import { describe, expect, it } from "vitest"

import { GAZE_REGION_DWELL_MS, GazeRegionDwell } from "./region-dwell"

describe("GazeRegionDwell", () => {
  it("does not commit a candidate before the dwell elapses", () => {
    const dwell = new GazeRegionDwell()
    expect(dwell.update("card-a", 0)).toBeNull()
    expect(dwell.update("card-a", GAZE_REGION_DWELL_MS - 1)).toBeNull()
  })

  it("commits a region once it has persisted for the dwell", () => {
    const dwell = new GazeRegionDwell()
    dwell.update("card-a", 0)
    expect(dwell.update("card-a", GAZE_REGION_DWELL_MS)).toBe("card-a")
  })

  it("ignores a flicker that does not outlast the dwell", () => {
    const dwell = new GazeRegionDwell()
    dwell.update("card-a", 0)
    dwell.update("card-a", GAZE_REGION_DWELL_MS)
    // A brief hop to card-b then back to card-a should not commit card-b.
    dwell.update("card-b", GAZE_REGION_DWELL_MS + 10)
    const committed = dwell.update("card-a", GAZE_REGION_DWELL_MS + 20)
    expect(committed).toBe("card-a")
  })

  it("commits looking away (null) after the dwell, dropping the region", () => {
    const dwell = new GazeRegionDwell()
    dwell.update("card-a", 0)
    dwell.update("card-a", GAZE_REGION_DWELL_MS)
    dwell.update(null, GAZE_REGION_DWELL_MS)
    expect(dwell.update(null, 2 * GAZE_REGION_DWELL_MS)).toBeNull()
  })

  it("reset clears the committed region", () => {
    const dwell = new GazeRegionDwell()
    dwell.update("card-a", 0)
    dwell.update("card-a", GAZE_REGION_DWELL_MS)
    dwell.reset()
    expect(dwell.current()).toBeNull()
  })
})
