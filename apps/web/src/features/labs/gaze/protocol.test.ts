import { describe, expect, it } from "vitest"

import {
  advanceProtocol,
  createProtocolTrials,
  PROTOCOL_DRIFT_WAIT_MS,
  PROTOCOL_REGION_IDS,
  PROTOCOL_TRIAL_MS,
  startProtocol,
} from "./protocol"

describe("gaze accuracy protocol", () => {
  it("builds 16 randomized trials with every region represented", () => {
    const trials = createProtocolTrials(900, 600, () => 0.25)
    expect(trials).toHaveLength(16)
    expect(new Set(trials.map((trial) => trial.region))).toEqual(
      new Set(PROTOCOL_REGION_IDS),
    )
  })

  it("scores baseline, waits for five-minute uptime, and completes drift", () => {
    let state = startProtocol(0, 0, { width: 900, height: 600 }, () => 0.25)
    for (let run = 0; run < 2; run += 1) {
      for (let trial = 0; trial < 16; trial += 1) {
        const target =
          state.phase === "baseline"
            ? state.baselineTrials[state.trialIndex]
            : state.driftTrials[state.trialIndex]
        const start = state.trialStartedAt
        for (let t = start; t < start + PROTOCOL_TRIAL_MS; t += 50) {
          state = advanceProtocol(state, {
            t,
            activeGridRegion: target?.region ?? null,
            processingMs: 4,
          })
        }
        state = advanceProtocol(state, {
          t: start + PROTOCOL_TRIAL_MS,
          activeGridRegion: target?.region ?? null,
          processingMs: 4,
        })
      }

      if (run === 0) {
        expect(state.phase).toBe("waiting-drift")
        state = advanceProtocol(state, {
          t: PROTOCOL_DRIFT_WAIT_MS,
          activeGridRegion: null,
          processingMs: 0,
        })
        expect(state.phase).toBe("drift")
      }
    }

    expect(state.phase).toBe("complete")
    expect(state.report?.baseline.overall.accuracyPercent).toBeGreaterThan(90)
    expect(state.report?.drift.overall.accuracyPercent).toBeGreaterThan(90)
    expect(state.report?.performance.meanFrameMs).toBeCloseTo(4)
  })
})
