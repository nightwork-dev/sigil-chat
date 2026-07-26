import { describe, expect, it } from "vitest"

import {
  GAZE_CAPTURE_PHASES,
  gazeCapturePresentation,
} from "./gaze-consent-state"

const isLive = (phase: (typeof GAZE_CAPTURE_PHASES)[number]) =>
  gazeCapturePresentation(phase).live

describe("gaze consent presentation", () => {
  it("has a presentation for every phase", () => {
    for (const phase of GAZE_CAPTURE_PHASES) {
      expect(gazeCapturePresentation(phase).phase).toBe(phase)
    }
  })

  it("resting off state offers to enable and is not live", () => {
    const off = gazeCapturePresentation("off")
    expect(off.action).toBe("enable")
    expect(off.live).toBe(false)
    expect(off.tone).toBe("muted")
  })

  it("is live for exactly the phases where the camera hardware is on", () => {
    const live = GAZE_CAPTURE_PHASES.filter((phase) => isLive(phase))
    expect(live).toEqual(["requesting", "calibrating", "tracking"])
  })

  it("every live phase offers to disable — capture is always reversible", () => {
    for (const phase of GAZE_CAPTURE_PHASES) {
      if (isLive(phase)) {
        expect(gazeCapturePresentation(phase).action).toBe("disable")
      }
    }
  })

  it("blocked state uses the destructive tone and offers to retry", () => {
    const denied = gazeCapturePresentation("denied")
    expect(denied.tone).toBe("destructive")
    expect(denied.action).toBe("enable")
    expect(denied.live).toBe(false)
  })

  it("the off consent label is honest about the camera and on-device scope", () => {
    const label = gazeCapturePresentation("off").label.toLowerCase()
    expect(label).toContain("camera")
    expect(label).toContain("device")
  })

  it("only live phases carry a readout, and resting/blocked do not", () => {
    for (const phase of GAZE_CAPTURE_PHASES) {
      const present = gazeCapturePresentation(phase)
      if (present.live) expect(present.readout).toBeTruthy()
      else expect(present.readout).toBeUndefined()
    }
  })
})
