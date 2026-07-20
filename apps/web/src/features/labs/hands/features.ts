import type { NormalizedLandmark } from "@mediapipe/tasks-vision"

export type Handedness = "Left" | "Right" | "Unknown"
export type HandGesture = "open-palm" | "thumbs-up" | "point" | "grab" | null

export interface Point2D {
  x: number
  y: number
}

export interface HandFeatures {
  handedness: Handedness
  confidence: number
  landmarks: NormalizedLandmark[]
  indexTip: Point2D
  pointDirection: Point2D
  pinchRatio: number
  pinchStrength: number
  grabStrength: number
  palmAngleDegrees: number
  fingerExtension: {
    index: number
    middle: number
    ring: number
    pinky: number
  }
  gesture: HandGesture
}

export const HAND_LANDMARKS = {
  wrist: 0,
  thumbCmc: 1,
  thumbMcp: 2,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  indexPip: 6,
  indexDip: 7,
  indexTip: 8,
  middleMcp: 9,
  middlePip: 10,
  middleDip: 11,
  middleTip: 12,
  ringMcp: 13,
  ringPip: 14,
  ringDip: 15,
  ringTip: 16,
  pinkyMcp: 17,
  pinkyPip: 18,
  pinkyDip: 19,
  pinkyTip: 20,
} as const

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
]

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function point(landmark: NormalizedLandmark): Point2D {
  return { x: landmark.x, y: landmark.y }
}

export function distance(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function angleAt(a: Point2D, center: Point2D, b: Point2D) {
  const ax = a.x - center.x
  const ay = a.y - center.y
  const bx = b.x - center.x
  const by = b.y - center.y
  const denominator = Math.max(Math.hypot(ax, ay) * Math.hypot(bx, by), 1e-6)
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / denominator)))
}

function extension(
  landmarks: NormalizedLandmark[],
  mcpIndex: number,
  pipIndex: number,
  tipIndex: number,
) {
  const angle = angleAt(
    point(landmarks[mcpIndex]!),
    point(landmarks[pipIndex]!),
    point(landmarks[tipIndex]!),
  )
  // Curled fingers sit near 1.4 rad; a straight finger approaches PI.
  return clamp01((angle - 1.4) / (Math.PI - 1.4))
}

export function toScreenPoint(
  normalized: Point2D,
  viewport: { width: number; height: number },
  mirrored = true,
): Point2D {
  return {
    x: (mirrored ? 1 - normalized.x : normalized.x) * viewport.width,
    y: normalized.y * viewport.height,
  }
}

export function extractHandFeatures(
  landmarks: NormalizedLandmark[],
  handedness: Handedness,
  confidence: number,
): HandFeatures {
  if (landmarks.length < 21) {
    throw new Error(`Expected 21 hand landmarks, received ${landmarks.length}.`)
  }

  const wrist = point(landmarks[HAND_LANDMARKS.wrist]!)
  const middleMcp = point(landmarks[HAND_LANDMARKS.middleMcp]!)
  const indexMcp = point(landmarks[HAND_LANDMARKS.indexMcp]!)
  const pinkyMcp = point(landmarks[HAND_LANDMARKS.pinkyMcp]!)
  const thumbMcp = point(landmarks[HAND_LANDMARKS.thumbMcp]!)
  const thumbTip = point(landmarks[HAND_LANDMARKS.thumbTip]!)
  const indexTip = point(landmarks[HAND_LANDMARKS.indexTip]!)
  const palmSpan = Math.max(distance(indexMcp, pinkyMcp), 1e-6)
  const pinchRatio = distance(thumbTip, indexTip) / palmSpan
  const pinchStrength = clamp01((0.82 - pinchRatio) / (0.82 - 0.18))

  const fingerExtension = {
    index: extension(
      landmarks,
      HAND_LANDMARKS.indexMcp,
      HAND_LANDMARKS.indexPip,
      HAND_LANDMARKS.indexTip,
    ),
    middle: extension(
      landmarks,
      HAND_LANDMARKS.middleMcp,
      HAND_LANDMARKS.middlePip,
      HAND_LANDMARKS.middleTip,
    ),
    ring: extension(
      landmarks,
      HAND_LANDMARKS.ringMcp,
      HAND_LANDMARKS.ringPip,
      HAND_LANDMARKS.ringTip,
    ),
    pinky: extension(
      landmarks,
      HAND_LANDMARKS.pinkyMcp,
      HAND_LANDMARKS.pinkyPip,
      HAND_LANDMARKS.pinkyTip,
    ),
  }
  const averageExtension =
    (fingerExtension.index +
      fingerExtension.middle +
      fingerExtension.ring +
      fingerExtension.pinky) /
    4
  const grabStrength = 1 - averageExtension
  const thumbExtension = distance(thumbTip, middleMcp) / palmSpan
  const thumbVector = {
    x: thumbTip.x - thumbMcp.x,
    y: thumbTip.y - thumbMcp.y,
  }

  let gesture: HandGesture = null
  if (
    averageExtension >= 0.72 &&
    thumbExtension >= 0.7 &&
    pinchStrength < 0.45
  ) {
    gesture = "open-palm"
  } else if (
    fingerExtension.index < 0.5 &&
    fingerExtension.middle < 0.5 &&
    fingerExtension.ring < 0.5 &&
    fingerExtension.pinky < 0.5 &&
    thumbExtension >= 0.75 &&
    thumbVector.y < -Math.abs(thumbVector.x) * 0.45
  ) {
    gesture = "thumbs-up"
  } else if (
    fingerExtension.index >= 0.72 &&
    fingerExtension.middle < 0.55 &&
    fingerExtension.ring < 0.55 &&
    fingerExtension.pinky < 0.55 &&
    pinchStrength < 0.55
  ) {
    gesture = "point"
  } else if (grabStrength >= 0.68 && pinchStrength < 0.7) {
    gesture = "grab"
  }

  const directionLength = Math.max(distance(indexMcp, indexTip), 1e-6)
  return {
    handedness,
    confidence,
    landmarks,
    indexTip,
    pointDirection: {
      x: (indexTip.x - indexMcp.x) / directionLength,
      y: (indexTip.y - indexMcp.y) / directionLength,
    },
    pinchRatio,
    pinchStrength,
    grabStrength,
    palmAngleDegrees:
      (Math.atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x) * 180) /
      Math.PI,
    fingerExtension,
    gesture,
  }
}
