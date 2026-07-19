import {
  fitGazeCalibration,
  predictGaze,
  type CalibrationSample,
  type GazeCalibration,
  type ScreenPoint,
} from "./calibration"

export type PoseCoverage = "covered" | "edge" | "outside"

export interface PoseCalibrationLayer {
  calibration: GazeCalibration
  pose: number[]
}

export interface LayeredGazePrediction {
  point: ScreenPoint
  coverage: PoseCoverage
  nearestDistance: number
  weights: number[]
}

const POSE_FEATURE_INDICES = [6, 7, 8, 9, 10] as const
const POSE_FEATURE_SCALES = [12, 12, 15, 0.08, 0.08] as const

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0)
}

function summarizePose(samples: CalibrationSample[]) {
  return POSE_FEATURE_INDICES.map((featureIndex) =>
    median(samples.map((sample) => sample.features[featureIndex] ?? 0)),
  )
}

export function poseDistance(pose: number[], features: number[]) {
  return Math.sqrt(
    POSE_FEATURE_INDICES.reduce((sum, featureIndex, index) => {
      const scale = POSE_FEATURE_SCALES[index] ?? 1
      const delta = ((features[featureIndex] ?? 0) - (pose[index] ?? 0)) / scale
      return sum + delta * delta
    }, 0),
  )
}

export function fitPoseCalibrationLayer(
  samples: CalibrationSample[],
): PoseCalibrationLayer {
  return {
    // Head pose chooses the local map; it must not directly drive screen
    // coordinates inside that map or a nod becomes a catastrophic gaze move.
    calibration: fitGazeCalibration(samples, {
      xFeatureIndices: [0, 2],
      yFeatureIndices: [1, 3],
      xPrimaryFeatureIndices: [0, 2],
      yPrimaryFeatureIndices: [1, 3],
      adaptiveFeatureSelection: true,
    }),
    pose: summarizePose(samples),
  }
}

export function upsertPoseCalibrationLayer(
  layers: PoseCalibrationLayer[],
  nextLayer: PoseCalibrationLayer,
  mergeDistance = 0.35,
) {
  const matchingIndex = layers.findIndex(
    (layer) =>
      Math.sqrt(
        layer.pose.reduce((sum, value, index) => {
          const delta =
            (value - (nextLayer.pose[index] ?? 0)) /
            (POSE_FEATURE_SCALES[index] ?? 1)
          return sum + delta * delta
        }, 0),
      ) <= mergeDistance,
  )
  if (matchingIndex < 0) return [...layers, nextLayer]
  return layers.map((layer, index) =>
    index === matchingIndex ? nextLayer : layer,
  )
}

export function predictLayeredGaze(
  layers: PoseCalibrationLayer[],
  features: number[],
): LayeredGazePrediction {
  if (layers.length === 0) throw new Error("Gaze needs a calibration layer.")

  const ranked = layers
    .map((layer, index) => ({
      index,
      distance: poseDistance(layer.pose, features),
      prediction: predictGaze(layer.calibration, features),
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, 2)
  const nearestDistance = ranked[0]?.distance ?? Number.POSITIVE_INFINITY
  const rawWeights = ranked.map(({ distance }) => 1 / (0.05 + distance ** 2))
  const weightTotal = rawWeights.reduce((sum, weight) => sum + weight, 0)
  const weights = rawWeights.map((weight) => weight / weightTotal)
  const point = ranked.reduce(
    (result, item, index) => ({
      x: result.x + item.prediction.x * (weights[index] ?? 0),
      y: result.y + item.prediction.y * (weights[index] ?? 0),
    }),
    { x: 0, y: 0 },
  )

  return {
    point,
    coverage:
      nearestDistance <= 0.8
        ? "covered"
        : nearestDistance <= 1.5
          ? "edge"
          : "outside",
    nearestDistance,
    weights: layers.map((_, layerIndex) => {
      const rankedIndex = ranked.findIndex((item) => item.index === layerIndex)
      return rankedIndex >= 0 ? (weights[rankedIndex] ?? 0) : 0
    }),
  }
}
