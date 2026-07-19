import type { ScreenPoint } from "./calibration"

export const PROTOCOL_REGION_IDS = Array.from(
  { length: 9 },
  (_, index) => `grid-r${Math.floor(index / 3)}c${index % 3}`,
)

export const PROTOCOL_TRIAL_MS = 2_500
export const PROTOCOL_GRACE_MS = 700
export const PROTOCOL_DRIFT_WAIT_MS = 5 * 60 * 1_000

export interface ProtocolTrial {
  region: string
  target: ScreenPoint
}

export interface RegionAccuracy {
  correctMs: number
  expectedMs: number
  observedMs: number
  accuracyPercent: number
  observationCoveragePercent: number
}

export interface AccuracyRunReport {
  overall: RegionAccuracy
  perRegion: Record<string, RegionAccuracy>
}

export interface PerformanceReport {
  frames: number
  meanFrameMs: number
  maxFrameMs: number
  mainThreadUtilizationPercent: number
}

export interface GazeProtocolReport {
  baseline: AccuracyRunReport
  drift: AccuracyRunReport
  driftDeltaPercentagePoints: number
  performance: PerformanceReport
}

interface RunAccumulator {
  correctMs: Record<string, number>
  observedMs: Record<string, number>
  lastSampleAt: number | null
}

export interface ProtocolState {
  phase: "idle" | "baseline" | "waiting-drift" | "drift" | "complete"
  trackingStartedAt: number
  trialIndex: number
  trialStartedAt: number
  baselineTrials: ProtocolTrial[]
  driftTrials: ProtocolTrial[]
  accumulator: RunAccumulator
  baselineReport: AccuracyRunReport | null
  report: GazeProtocolReport | null
  performanceTotalMs: number
  performanceMaxMs: number
  performanceFrames: number
  activeRunStartedAt: number
  activeRunElapsedMs: number
}

export interface ProtocolSample {
  t: number
  activeGridRegion: string | null
  processingMs: number
}

function shuffle<T>(values: T[], random: () => number) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[other] as T
    result[other] = current as T
  }
  return result
}

export function createProtocolTrials(
  width: number,
  height: number,
  random: () => number = Math.random,
): ProtocolTrial[] {
  const regionIds = [
    ...PROTOCOL_REGION_IDS,
    ...Array.from(
      { length: 7 },
      () => PROTOCOL_REGION_IDS[Math.floor(random() * 9)] as string,
    ),
  ]

  return shuffle(regionIds, random).map((region) => {
    const match = /grid-r(\d)c(\d)/.exec(region)
    const row = Number(match?.[1] ?? 0)
    const column = Number(match?.[2] ?? 0)
    // Keep targets away from grid boundaries: 25–75% inside the selected cell.
    const localX = 0.25 + random() * 0.5
    const localY = 0.25 + random() * 0.5
    return {
      region,
      target: {
        x: ((column + localX) * width) / 3,
        y: ((row + localY) * height) / 3,
      },
    }
  })
}

function emptyAccumulator(): RunAccumulator {
  return {
    correctMs: Object.fromEntries(PROTOCOL_REGION_IDS.map((id) => [id, 0])),
    observedMs: Object.fromEntries(PROTOCOL_REGION_IDS.map((id) => [id, 0])),
    lastSampleAt: null,
  }
}

export function createIdleProtocolState(): ProtocolState {
  return {
    phase: "idle",
    trackingStartedAt: 0,
    trialIndex: 0,
    trialStartedAt: 0,
    baselineTrials: [],
    driftTrials: [],
    accumulator: emptyAccumulator(),
    baselineReport: null,
    report: null,
    performanceTotalMs: 0,
    performanceMaxMs: 0,
    performanceFrames: 0,
    activeRunStartedAt: 0,
    activeRunElapsedMs: 0,
  }
}

export function startProtocol(
  now: number,
  trackingStartedAt: number,
  viewport: { width: number; height: number },
  random: () => number = Math.random,
): ProtocolState {
  return {
    ...createIdleProtocolState(),
    phase: "baseline",
    trackingStartedAt,
    trialStartedAt: now,
    baselineTrials: createProtocolTrials(
      viewport.width,
      viewport.height,
      random,
    ),
    driftTrials: createProtocolTrials(viewport.width, viewport.height, random),
    activeRunStartedAt: now,
  }
}

export function currentProtocolTarget(state: ProtocolState) {
  if (state.phase === "baseline") {
    return state.baselineTrials[state.trialIndex] ?? null
  }
  if (state.phase === "drift") {
    return state.driftTrials[state.trialIndex] ?? null
  }
  return null
}

function scoreReport(
  accumulator: RunAccumulator,
  trials: ProtocolTrial[],
): AccuracyRunReport {
  const scoredWindowMs = PROTOCOL_TRIAL_MS - PROTOCOL_GRACE_MS
  const perRegion = Object.fromEntries(
    PROTOCOL_REGION_IDS.map((region) => {
      const trialCount = trials.filter(
        (trial) => trial.region === region,
      ).length
      const expectedMs = trialCount * scoredWindowMs
      const correctMs = accumulator.correctMs[region] ?? 0
      const observedMs = accumulator.observedMs[region] ?? 0
      return [
        region,
        {
          correctMs,
          expectedMs,
          observedMs,
          accuracyPercent: expectedMs ? (correctMs / expectedMs) * 100 : 0,
          observationCoveragePercent: expectedMs
            ? (observedMs / expectedMs) * 100
            : 0,
        },
      ]
    }),
  )
  const overall = Object.values(perRegion).reduce<RegionAccuracy>(
    (total, region) => ({
      correctMs: total.correctMs + region.correctMs,
      expectedMs: total.expectedMs + region.expectedMs,
      observedMs: total.observedMs + region.observedMs,
      accuracyPercent: 0,
      observationCoveragePercent: 0,
    }),
    {
      correctMs: 0,
      expectedMs: 0,
      observedMs: 0,
      accuracyPercent: 0,
      observationCoveragePercent: 0,
    },
  )
  overall.accuracyPercent = overall.expectedMs
    ? (overall.correctMs / overall.expectedMs) * 100
    : 0
  overall.observationCoveragePercent = overall.expectedMs
    ? (overall.observedMs / overall.expectedMs) * 100
    : 0
  return { overall, perRegion }
}

function completeDriftRun(state: ProtocolState, now: number): ProtocolState {
  const baseline = state.baselineReport
  if (!baseline)
    throw new Error("Cannot finish drift without a baseline report.")
  const drift = scoreReport(state.accumulator, state.driftTrials)
  const activeRunElapsedMs =
    state.activeRunElapsedMs + (now - state.activeRunStartedAt)
  const performance: PerformanceReport = {
    frames: state.performanceFrames,
    meanFrameMs: state.performanceFrames
      ? state.performanceTotalMs / state.performanceFrames
      : 0,
    maxFrameMs: state.performanceMaxMs,
    mainThreadUtilizationPercent: activeRunElapsedMs
      ? (state.performanceTotalMs / activeRunElapsedMs) * 100
      : 0,
  }
  return {
    ...state,
    phase: "complete",
    activeRunElapsedMs,
    report: {
      baseline,
      drift,
      driftDeltaPercentagePoints:
        drift.overall.accuracyPercent - baseline.overall.accuracyPercent,
      performance,
    },
  }
}

function advanceTrial(state: ProtocolState, now: number): ProtocolState {
  const trials =
    state.phase === "baseline" ? state.baselineTrials : state.driftTrials
  if (state.trialIndex + 1 < trials.length) {
    return {
      ...state,
      trialIndex: state.trialIndex + 1,
      trialStartedAt: now,
      accumulator: { ...state.accumulator, lastSampleAt: null },
    }
  }

  if (state.phase === "baseline") {
    return {
      ...state,
      phase: "waiting-drift",
      trialIndex: 0,
      baselineReport: scoreReport(state.accumulator, state.baselineTrials),
      accumulator: emptyAccumulator(),
      activeRunElapsedMs: now - state.activeRunStartedAt,
    }
  }

  return completeDriftRun(state, now)
}

export function advanceProtocol(
  state: ProtocolState,
  sample: ProtocolSample,
): ProtocolState {
  if (state.phase === "idle" || state.phase === "complete") return state

  if (state.phase === "waiting-drift") {
    if (sample.t - state.trackingStartedAt < PROTOCOL_DRIFT_WAIT_MS)
      return state
    return {
      ...state,
      phase: "drift",
      trialIndex: 0,
      trialStartedAt: sample.t,
      activeRunStartedAt: sample.t,
      accumulator: emptyAccumulator(),
    }
  }

  if (sample.t - state.trialStartedAt >= PROTOCOL_TRIAL_MS) {
    return advanceTrial(state, sample.t)
  }

  const target = currentProtocolTarget(state)
  if (!target) return state

  const accumulator: RunAccumulator = {
    correctMs: { ...state.accumulator.correctMs },
    observedMs: { ...state.accumulator.observedMs },
    lastSampleAt: sample.t,
  }
  const previousSampleAt = state.accumulator.lastSampleAt
  const afterGrace = sample.t - state.trialStartedAt >= PROTOCOL_GRACE_MS
  if (previousSampleAt !== null && afterGrace) {
    // A backgrounded tab cannot earn seconds of accuracy from one stale frame.
    const duration = Math.min(Math.max(sample.t - previousSampleAt, 0), 100)
    if (sample.activeGridRegion) {
      accumulator.observedMs[target.region] =
        (accumulator.observedMs[target.region] ?? 0) + duration
      if (sample.activeGridRegion === target.region) {
        accumulator.correctMs[target.region] =
          (accumulator.correctMs[target.region] ?? 0) + duration
      }
    }
  }

  return {
    ...state,
    accumulator,
    performanceTotalMs: state.performanceTotalMs + sample.processingMs,
    performanceMaxMs: Math.max(state.performanceMaxMs, sample.processingMs),
    performanceFrames: state.performanceFrames + 1,
  }
}

export function recommendProtocol(report: GazeProtocolReport) {
  const baseline = report.baseline.overall.accuracyPercent
  const drift = report.drift.overall.accuracyPercent
  const driftMagnitude = Math.abs(report.driftDeltaPercentagePoints)
  const meanFrame = report.performance.meanFrameMs

  if (baseline >= 80 && drift >= 75 && driftMagnitude <= 10 && meanFrame <= 8) {
    return "wire" as const
  }
  if (baseline >= 55 && drift >= 50 && meanFrame <= 16) {
    return "iterate" as const
  }
  return "drop" as const
}
