import type { Point2D } from "./features"
import type { ConfirmedGesture } from "./gestures"

export const PINCH_TARGET_SIZES = [64, 48, 36, 24] as const
export const PINCH_TRIALS_PER_SIZE = 4
export const GESTURE_CLASSES: ConfirmedGesture[] = [
  "open-palm",
  "thumbs-up",
  "point",
]

export interface PinchTrial {
  size: number
  center: Point2D
}

export interface PinchAttempt {
  size: number
  hit: boolean
  errorPx: number
}

export interface DragPathReport {
  samples: number
  meanErrorPx: number
  p95ErrorPx: number
}

export interface PerformanceReport {
  frames: number
  meanFrameMs: number
  maxFrameMs: number
  mainThreadUtilizationPercent: number
}

export interface GestureReport {
  prompts: number
  accuracyPercent: number
  confusionMatrix: Record<ConfirmedGesture, Record<ConfirmedGesture, number>>
}

export interface PinchReport {
  attempts: number
  hits: number
  accuracyPercent: number
  smallestReliableTargetPx: number | null
  bySize: Record<
    string,
    { attempts: number; hits: number; accuracyPercent: number }
  >
}

export interface HandsProtocolReport {
  pinch: PinchReport
  drag: DragPathReport
  gestures: GestureReport
  performance: PerformanceReport
  recommendations: {
    tier1Cursor: "wire" | "iterate" | "drop"
    tier2Manipulation: "wire" | "iterate" | "drop"
    tier3Gestures: "wire" | "iterate" | "drop"
  }
}

export interface HandsProtocolState {
  phase: "idle" | "pinch" | "drag" | "gestures" | "complete"
  startedAt: number
  viewport: { width: number; height: number }
  pinchTrials: PinchTrial[]
  pinchIndex: number
  pinchAttempts: PinchAttempt[]
  dragPath: Point2D[]
  dragging: boolean
  dragSamples: Point2D[]
  gesturePrompts: ConfirmedGesture[]
  gestureIndex: number
  gestureResults: Array<{
    expected: ConfirmedGesture
    actual: ConfirmedGesture
  }>
  performanceTotalMs: number
  performanceMaxMs: number
  performanceFrames: number
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

export function createPinchTrials(
  viewport: { width: number; height: number },
  random: () => number = Math.random,
): PinchTrial[] {
  const margin = 90
  return PINCH_TARGET_SIZES.flatMap((size) =>
    Array.from({ length: PINCH_TRIALS_PER_SIZE }, () => ({
      size,
      center: {
        x: margin + random() * Math.max(1, viewport.width - margin * 2),
        y: margin + random() * Math.max(1, viewport.height - margin * 2),
      },
    })),
  )
}

export function createDragPath(viewport: { width: number; height: number }) {
  const left = viewport.width * 0.18
  const right = viewport.width * 0.82
  const centerY = viewport.height * 0.56
  const amplitude = Math.min(130, viewport.height * 0.2)
  return Array.from({ length: 49 }, (_, index) => {
    const progress = index / 48
    return {
      x: left + (right - left) * progress,
      y: centerY + Math.sin(progress * Math.PI * 2) * amplitude,
    }
  })
}

export function createGesturePrompts(random: () => number = Math.random) {
  return shuffle(
    Array.from({ length: 3 }, () => GESTURE_CLASSES).flat(),
    random,
  )
}

export function createIdleHandsProtocol(): HandsProtocolState {
  return {
    phase: "idle",
    startedAt: 0,
    viewport: { width: 0, height: 0 },
    pinchTrials: [],
    pinchIndex: 0,
    pinchAttempts: [],
    dragPath: [],
    dragging: false,
    dragSamples: [],
    gesturePrompts: [],
    gestureIndex: 0,
    gestureResults: [],
    performanceTotalMs: 0,
    performanceMaxMs: 0,
    performanceFrames: 0,
  }
}

export function startHandsProtocol(
  now: number,
  viewport: { width: number; height: number },
  random: () => number = Math.random,
): HandsProtocolState {
  return {
    ...createIdleHandsProtocol(),
    phase: "pinch",
    startedAt: now,
    viewport,
    pinchTrials: createPinchTrials(viewport, random),
    dragPath: createDragPath(viewport),
    gesturePrompts: createGesturePrompts(random),
  }
}

export function currentPinchTrial(state: HandsProtocolState) {
  return state.phase === "pinch"
    ? (state.pinchTrials[state.pinchIndex] ?? null)
    : null
}

export function currentGesturePrompt(state: HandsProtocolState) {
  return state.phase === "gestures"
    ? (state.gesturePrompts[state.gestureIndex] ?? null)
    : null
}

export function recordPerformance(
  state: HandsProtocolState,
  processingMs: number,
): HandsProtocolState {
  if (state.phase === "idle" || state.phase === "complete") return state
  return {
    ...state,
    performanceTotalMs: state.performanceTotalMs + processingMs,
    performanceMaxMs: Math.max(state.performanceMaxMs, processingMs),
    performanceFrames: state.performanceFrames + 1,
  }
}

export function recordPinchAttempt(
  state: HandsProtocolState,
  point: Point2D,
): HandsProtocolState {
  const trial = currentPinchTrial(state)
  if (!trial) return state
  const errorPx = Math.hypot(point.x - trial.center.x, point.y - trial.center.y)
  const attempt = { size: trial.size, hit: errorPx <= trial.size / 2, errorPx }
  const pinchAttempts = [...state.pinchAttempts, attempt]
  if (state.pinchIndex + 1 >= state.pinchTrials.length) {
    return {
      ...state,
      phase: "drag",
      pinchAttempts,
      pinchIndex: state.pinchIndex + 1,
    }
  }
  return { ...state, pinchAttempts, pinchIndex: state.pinchIndex + 1 }
}

export function distanceToSegment(point: Point2D, a: Point2D, b: Point2D) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 1e-6) return Math.hypot(point.x - a.x, point.y - a.y)
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
  )
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

export function distanceToPolyline(point: Point2D, path: Point2D[]) {
  if (path.length === 0) return Number.POSITIVE_INFINITY
  if (path.length === 1)
    return Math.hypot(point.x - path[0]!.x, point.y - path[0]!.y)
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 1; index < path.length; index += 1) {
    minimum = Math.min(
      minimum,
      distanceToSegment(point, path[index - 1]!, path[index]!),
    )
  }
  return minimum
}

export function beginProtocolDrag(
  state: HandsProtocolState,
  point: Point2D,
): HandsProtocolState {
  if (state.phase !== "drag") return state
  const start = state.dragPath[0]
  if (!start || Math.hypot(point.x - start.x, point.y - start.y) > 56)
    return state
  return { ...state, dragging: true, dragSamples: [point] }
}

export function recordProtocolDragPoint(
  state: HandsProtocolState,
  point: Point2D,
): HandsProtocolState {
  if (state.phase !== "drag" || !state.dragging) return state
  return { ...state, dragSamples: [...state.dragSamples, point] }
}

export function endProtocolDrag(state: HandsProtocolState): HandsProtocolState {
  if (state.phase !== "drag" || !state.dragging) return state
  if (state.dragSamples.length < 10) {
    return { ...state, dragging: false, dragSamples: [] }
  }
  return { ...state, phase: "gestures", dragging: false }
}

export function recordGestureResult(
  state: HandsProtocolState,
  actual: ConfirmedGesture,
): HandsProtocolState {
  const expected = currentGesturePrompt(state)
  if (!expected) return state
  const gestureResults = [...state.gestureResults, { expected, actual }]
  if (state.gestureIndex + 1 >= state.gesturePrompts.length) {
    return {
      ...state,
      phase: "complete",
      gestureIndex: state.gestureIndex + 1,
      gestureResults,
    }
  }
  return {
    ...state,
    gestureIndex: state.gestureIndex + 1,
    gestureResults,
  }
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ??
    0
  )
}

export function buildHandsProtocolReport(
  state: HandsProtocolState,
  now: number,
): HandsProtocolReport | null {
  if (state.phase !== "complete") return null

  const bySize = Object.fromEntries(
    PINCH_TARGET_SIZES.map((size) => {
      const attempts = state.pinchAttempts.filter(
        (attempt) => attempt.size === size,
      )
      const hits = attempts.filter((attempt) => attempt.hit).length
      return [
        String(size),
        {
          attempts: attempts.length,
          hits,
          accuracyPercent: attempts.length ? (hits / attempts.length) * 100 : 0,
        },
      ]
    }),
  )
  const reliableSizes = PINCH_TARGET_SIZES.filter(
    (size) => (bySize[String(size)]?.accuracyPercent ?? 0) >= 75,
  )
  const pinchHits = state.pinchAttempts.filter((attempt) => attempt.hit).length
  const pinch: PinchReport = {
    attempts: state.pinchAttempts.length,
    hits: pinchHits,
    accuracyPercent: state.pinchAttempts.length
      ? (pinchHits / state.pinchAttempts.length) * 100
      : 0,
    smallestReliableTargetPx:
      reliableSizes.length > 0 ? Math.min(...reliableSizes) : null,
    bySize,
  }

  const dragErrors = state.dragSamples.map((sample) =>
    distanceToPolyline(sample, state.dragPath),
  )
  const drag: DragPathReport = {
    samples: dragErrors.length,
    meanErrorPx: dragErrors.length
      ? dragErrors.reduce((total, value) => total + value, 0) /
        dragErrors.length
      : 0,
    p95ErrorPx: percentile(dragErrors, 0.95),
  }

  const confusionMatrix = Object.fromEntries(
    GESTURE_CLASSES.map((expected) => [
      expected,
      Object.fromEntries(GESTURE_CLASSES.map((actual) => [actual, 0])),
    ]),
  ) as GestureReport["confusionMatrix"]
  for (const result of state.gestureResults) {
    confusionMatrix[result.expected][result.actual] += 1
  }
  const gestureCorrect = state.gestureResults.filter(
    (result) => result.expected === result.actual,
  ).length
  const gestures: GestureReport = {
    prompts: state.gestureResults.length,
    accuracyPercent: state.gestureResults.length
      ? (gestureCorrect / state.gestureResults.length) * 100
      : 0,
    confusionMatrix,
  }

  const elapsed = Math.max(1, now - state.startedAt)
  const performance: PerformanceReport = {
    frames: state.performanceFrames,
    meanFrameMs: state.performanceFrames
      ? state.performanceTotalMs / state.performanceFrames
      : 0,
    maxFrameMs: state.performanceMaxMs,
    mainThreadUtilizationPercent: (state.performanceTotalMs / elapsed) * 100,
  }

  const target = pinch.smallestReliableTargetPx
  const tier1Cursor =
    target !== null &&
    target <= 48 &&
    pinch.accuracyPercent >= 80 &&
    performance.meanFrameMs <= 8
      ? "wire"
      : target !== null &&
          target <= 64 &&
          pinch.accuracyPercent >= 60 &&
          performance.meanFrameMs <= 16
        ? "iterate"
        : "drop"
  const tier2Manipulation =
    drag.samples >= 10 && drag.meanErrorPx <= 30
      ? "wire"
      : drag.samples >= 10 && drag.meanErrorPx <= 70
        ? "iterate"
        : "drop"
  const tier3Gestures =
    gestures.accuracyPercent >= 85
      ? "wire"
      : gestures.accuracyPercent >= 60
        ? "iterate"
        : "drop"

  return {
    pinch,
    drag,
    gestures,
    performance,
    recommendations: { tier1Cursor, tier2Manipulation, tier3Gestures },
  }
}
