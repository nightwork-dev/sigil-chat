import type { Matrix, NormalizedLandmark } from "@mediapipe/tasks-vision"

/**
 * MediaPipe Face Mesh indices used by the spike.
 *
 * The camera image is not mirrored before inference. Calibration absorbs the
 * user's camera geometry, so these anatomical left/right labels are retained
 * even though the preview is mirrored for familiarity.
 */
export const GAZE_LANDMARKS = {
  rightEye: {
    outerCorner: 33,
    innerCorner: 133,
    upperLid: 159,
    lowerLid: 145,
    irisCenter: 468,
  },
  leftEye: {
    innerCorner: 362,
    outerCorner: 263,
    upperLid: 386,
    lowerLid: 374,
    irisCenter: 473,
  },
} as const

export interface HeadPose {
  yaw: number
  pitch: number
  roll: number
  translationX: number
  translationY: number
  translationZ: number
}

export interface ExtractedGazeFeatures {
  /** Twelve values. The regression adds its own thirteenth bias column. */
  values: number[]
  eyeOpenness: [number, number]
  headPose: HeadPose
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function eyeFeatures(
  landmarks: NormalizedLandmark[],
  indices: (typeof GAZE_LANDMARKS)[keyof typeof GAZE_LANDMARKS],
) {
  const outer = landmarks[indices.outerCorner]
  const inner = landmarks[indices.innerCorner]
  const upper = landmarks[indices.upperLid]
  const lower = landmarks[indices.lowerLid]
  const iris = landmarks[indices.irisCenter]
  if (!outer || !inner || !upper || !lower || !iris) {
    throw new Error("FaceLandmarker result is missing required eye landmarks.")
  }

  const width = Math.max(distance(outer, inner), 1e-6)
  const midpointX = (outer.x + inner.x) / 2
  const midpointY = (outer.y + inner.y) / 2
  return {
    x: (iris.x - midpointX) / width,
    y: (iris.y - midpointY) / width,
    openness: distance(upper, lower) / width,
  }
}

/** Convert MediaPipe's column-major 4x4 facial transform to Euler degrees. */
export function extractHeadPose(matrix: Matrix): HeadPose {
  if (matrix.rows !== 4 || matrix.columns !== 4 || matrix.data.length < 16) {
    throw new Error("Expected a 4x4 facial transformation matrix.")
  }

  const data = matrix.data
  const r00 = data[0] ?? 1
  const r10 = data[1] ?? 0
  const r20 = data[2] ?? 0
  const r21 = data[6] ?? 0
  const r22 = data[10] ?? 1
  const toDegrees = 180 / Math.PI

  // ZYX decomposition: yaw around Y, pitch around X, roll around Z.
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r20))) * toDegrees
  const pitch = Math.atan2(r21, r22) * toDegrees
  const roll = Math.atan2(r10, r00) * toDegrees

  const tx = data[12] ?? 0
  const ty = data[13] ?? 0
  const tz = data[14] ?? 0
  const translationLength = Math.max(Math.hypot(tx, ty, tz), 1e-6)

  return {
    yaw,
    pitch,
    roll,
    translationX: tx / translationLength,
    translationY: ty / translationLength,
    translationZ: tz / translationLength,
  }
}

export function extractGazeFeatures(
  landmarks: NormalizedLandmark[],
  matrix: Matrix,
): ExtractedGazeFeatures {
  if (landmarks.length < 478) {
    throw new Error(
      `Expected 478 face landmarks, received ${landmarks.length}.`,
    )
  }

  const right = eyeFeatures(landmarks, GAZE_LANDMARKS.rightEye)
  const left = eyeFeatures(landmarks, GAZE_LANDMARKS.leftEye)
  const headPose = extractHeadPose(matrix)

  return {
    values: [
      right.x,
      right.y,
      left.x,
      left.y,
      right.openness,
      left.openness,
      headPose.yaw,
      headPose.pitch,
      headPose.roll,
      headPose.translationX,
      headPose.translationY,
      headPose.translationZ,
    ],
    eyeOpenness: [right.openness, left.openness],
    headPose,
  }
}
