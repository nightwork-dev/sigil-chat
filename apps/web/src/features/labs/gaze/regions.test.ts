import { describe, expect, it } from "vitest"

import { grid3x3Regions, HysteresisQuantizer } from "./regions"

describe("region hysteresis", () => {
  const viewport = { width: 900, height: 600 }
  const regions = grid3x3Regions(viewport.width, viewport.height)

  it("enters the initial region immediately", () => {
    const quantizer = new HysteresisQuantizer()
    const update = quantizer.update({ x: 100, y: 100 }, 0, regions, viewport)
    expect(update.activeRegion).toBe("grid-r0c0")
    expect(update.events).toEqual([
      { type: "enter", region: "grid-r0c0", t: 0 },
    ])
  })

  it("requires both boundary depth and dwell before switching", () => {
    const quantizer = new HysteresisQuantizer(150, 24)
    quantizer.update({ x: 100, y: 100 }, 0, regions, viewport)
    expect(
      quantizer.update({ x: 310, y: 100 }, 50, regions, viewport).activeRegion,
    ).toBe("grid-r0c0")
    expect(
      quantizer.update({ x: 350, y: 100 }, 100, regions, viewport).activeRegion,
    ).toBe("grid-r0c0")
    expect(
      quantizer.update({ x: 350, y: 100 }, 249, regions, viewport).activeRegion,
    ).toBe("grid-r0c0")
    const switched = quantizer.update(
      { x: 350, y: 100 },
      250,
      regions,
      viewport,
    )
    expect(switched.activeRegion).toBe("grid-r0c1")
    expect(switched.events.map((event) => event.type)).toEqual([
      "leave",
      "enter",
    ])
  })

  it("pauses pending transitions while confidence is low", () => {
    const quantizer = new HysteresisQuantizer(150, 24)
    quantizer.update({ x: 100, y: 100 }, 0, regions, viewport)
    quantizer.update({ x: 350, y: 100 }, 100, regions, viewport)
    quantizer.update({ x: 350, y: 100 }, 300, regions, viewport, false)
    expect(
      quantizer.update({ x: 350, y: 100 }, 301, regions, viewport).activeRegion,
    ).toBe("grid-r0c0")
  })
})
