import { describe, expect, it } from "vitest"

import {
  GAZE_SELECTION_KIND,
  gazeRegionFromChain,
  gazeRegionSelection,
  type GazeDatasetLike,
} from "./gaze-region"

// Fixture: a dataset chain innermost → outermost, the shape the DOM walk
// produces. Derived per-test, never counted.
function chain(...ids: (GazeDatasetLike | string)[]): GazeDatasetLike[] {
  return ids.map((entry) =>
    typeof entry === "string" ? { gazeId: entry } : entry,
  )
}

describe("gazeRegionFromChain", () => {
  it("returns the nearest opted-in region, not an outer one", () => {
    const region = gazeRegionFromChain(
      chain({ gazeId: "card-alpha", gazeLabel: "Card Alpha" }, "workspace"),
    )
    expect(region).toEqual({ id: "card-alpha", label: "Card Alpha" })
  })

  it("falls back to the id as label when none is provided", () => {
    const region = gazeRegionFromChain(chain("composer"))
    expect(region).toEqual({ id: "composer", label: "composer" })
  })

  it("skips ancestors that did not opt in", () => {
    const region = gazeRegionFromChain(
      chain({}, {}, { gazeId: "portrait", gazeLabel: "Eve" }),
    )
    expect(region?.id).toBe("portrait")
  })

  it("returns null over chrome that opted in nowhere", () => {
    expect(gazeRegionFromChain(chain({}, {}))).toBeNull()
    expect(gazeRegionFromChain([])).toBeNull()
  })

  it("treats blank/whitespace ids as not opted in", () => {
    expect(gazeRegionFromChain(chain({ gazeId: "  " }))).toBeNull()
  })
})

describe("gazeRegionSelection", () => {
  it("is null when nothing is gazed", () => {
    expect(gazeRegionSelection(null)).toBeNull()
  })

  it("marks the selection as gaze-derived and advisory", () => {
    const selection = gazeRegionSelection({ id: "card-alpha", label: "Card Alpha" })
    expect(selection).toMatchObject({
      kind: GAZE_SELECTION_KIND,
      id: "card-alpha",
      label: "Card Alpha",
      detail: { source: "gaze" },
    })
  })
})
