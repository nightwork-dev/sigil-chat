export interface ScreenPoint {
  x: number
  y: number
}

export interface CalibrationSample {
  features: number[]
  target: ScreenPoint
}

interface CalibrationAxisModel {
  featureIndices: number[]
  means: number[]
  scales: number[]
  weights: number[]
  lambda: number
}

export interface FeatureEvidence {
  featureIndex: number
  betweenRange: number
  withinSpread: number
  discrimination: number
}

export interface AxisCalibrationDiagnostics {
  selectedFeatureIndices: number[]
  evidence: FeatureEvidence[]
  biasPixels: number
  gain: number
  rmsePixels: number
  lowEvidence: boolean
}

export interface CalibrationDiagnostics {
  x: AxisCalibrationDiagnostics
  y: AxisCalibrationDiagnostics
}

export interface GazeCalibration {
  featureCount: number
  xModel: CalibrationAxisModel
  yModel: CalibrationAxisModel
  diagnostics: CalibrationDiagnostics
}

export interface GazeCalibrationOptions {
  xFeatureIndices?: number[]
  yFeatureIndices?: number[]
  lambdaCandidates?: number[]
  adaptiveFeatureSelection?: boolean
  xPrimaryFeatureIndices?: number[]
  yPrimaryFeatureIndices?: number[]
}

export interface CalibrationTargetSummary {
  sample: CalibrationSample
  retainedFrames: number
  totalFrames: number
}

export type NormalizedCalibrationTarget = readonly [number, number]

const DEFAULT_LAMBDAS = [1e-4, 1e-3, 1e-2, 1e-1, 1]
const ROBUST_Z_LIMIT = 4.5

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
  }
  return sorted[middle] ?? 0
}

function solveLinearSystem(matrix: number[][], values: number[]) {
  const size = values.length
  const augmented = matrix.map((row, index) => [...row, values[index] ?? 0])

  for (let column = 0; column < size; column += 1) {
    let pivot = column
    for (let row = column + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row]?.[column] ?? 0) >
        Math.abs(augmented[pivot]?.[column] ?? 0)
      ) {
        pivot = row
      }
    }

    const pivotValue = augmented[pivot]?.[column] ?? 0
    if (Math.abs(pivotValue) < 1e-12) {
      throw new Error(
        "Calibration matrix is singular; collect a fresh calibration.",
      )
    }

    ;[augmented[column], augmented[pivot]] = [
      augmented[pivot] ?? [],
      augmented[column] ?? [],
    ]

    const current = augmented[column]
    if (!current) throw new Error("Calibration solver lost its pivot row.")
    for (let index = column; index <= size; index += 1) {
      current[index] = (current[index] ?? 0) / pivotValue
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue
      const target = augmented[row]
      if (!target) continue
      const factor = target[column] ?? 0
      for (let index = column; index <= size; index += 1) {
        target[index] = (target[index] ?? 0) - factor * (current[index] ?? 0)
      }
    }
  }

  return augmented.map((row) => row[size] ?? 0)
}

function fitAxis(
  samples: CalibrationSample[],
  axis: keyof ScreenPoint,
  featureIndices: number[],
  lambda: number,
): CalibrationAxisModel {
  const means = featureIndices.map(
    (featureIndex) =>
      samples.reduce(
        (sum, sample) => sum + (sample.features[featureIndex] ?? 0),
        0,
      ) / samples.length,
  )
  const scales = featureIndices.map((featureIndex, index) => {
    const mean = means[index] ?? 0
    const variance =
      samples.reduce((sum, sample) => {
        const delta = (sample.features[featureIndex] ?? 0) - mean
        return sum + delta * delta
      }, 0) / samples.length
    const scale = Math.sqrt(variance)
    return scale > 1e-8 ? scale : 1
  })
  const columnCount = featureIndices.length + 1
  const gram = Array.from({ length: columnCount }, () =>
    Array.from({ length: columnCount }, () => 0),
  )
  const projection = Array.from({ length: columnCount }, () => 0)

  for (const sample of samples) {
    const row = [
      ...featureIndices.map(
        (featureIndex, index) =>
          ((sample.features[featureIndex] ?? 0) - (means[index] ?? 0)) /
          (scales[index] ?? 1),
      ),
      1,
    ]
    for (let left = 0; left < columnCount; left += 1) {
      projection[left] =
        (projection[left] ?? 0) + (row[left] ?? 0) * sample.target[axis]
      for (let right = 0; right < columnCount; right += 1) {
        const gramRow = gram[left]
        if (gramRow) {
          gramRow[right] =
            (gramRow[right] ?? 0) + (row[left] ?? 0) * (row[right] ?? 0)
        }
      }
    }
  }

  for (let index = 0; index < featureIndices.length; index += 1) {
    const row = gram[index]
    if (row) row[index] = (row[index] ?? 0) + lambda
  }

  return {
    featureIndices: [...featureIndices],
    means,
    scales,
    weights: solveLinearSystem(gram, projection),
    lambda,
  }
}

function predictAxis(model: CalibrationAxisModel, features: number[]) {
  const row = [
    ...model.featureIndices.map(
      (featureIndex, index) =>
        ((features[featureIndex] ?? 0) - (model.means[index] ?? 0)) /
        (model.scales[index] ?? 1),
    ),
    1,
  ]
  return row.reduce(
    (sum, value, index) => sum + value * (model.weights[index] ?? 0),
    0,
  )
}

function selectLambda(
  samples: CalibrationSample[],
  axis: keyof ScreenPoint,
  featureIndices: number[],
  candidates: number[],
) {
  if (candidates.length === 1 || samples.length <= featureIndices.length + 2) {
    return candidates[0] ?? 1e-3
  }

  let bestLambda = candidates[0] ?? 1e-3
  let bestError = Number.POSITIVE_INFINITY
  for (const lambda of candidates) {
    let squaredError = 0
    for (
      let heldOutIndex = 0;
      heldOutIndex < samples.length;
      heldOutIndex += 1
    ) {
      const training = samples.filter((_, index) => index !== heldOutIndex)
      const heldOut = samples[heldOutIndex]
      if (!heldOut) continue
      const model = fitAxis(training, axis, featureIndices, lambda)
      const error = predictAxis(model, heldOut.features) - heldOut.target[axis]
      squaredError += error * error
    }
    if (squaredError < bestError) {
      bestError = squaredError
      bestLambda = lambda
    }
  }
  return bestLambda
}

function axisPredictions(
  samples: CalibrationSample[],
  axis: keyof ScreenPoint,
  featureIndices: number[],
  lambda: number,
) {
  return samples.map((heldOut, heldOutIndex) => {
    const training = samples.filter((_, index) => index !== heldOutIndex)
    const model = fitAxis(training, axis, featureIndices, lambda)
    return predictAxis(model, heldOut.features)
  })
}

function axisRmse(
  samples: CalibrationSample[],
  predictions: number[],
  axis: keyof ScreenPoint,
) {
  return Math.sqrt(
    samples.reduce((sum, sample, index) => {
      const error = (predictions[index] ?? 0) - sample.target[axis]
      return sum + error * error
    }, 0) / samples.length,
  )
}

function combinations(values: number[], maximumSize: number) {
  const result: number[][] = []
  const visit = (start: number, current: number[]) => {
    if (current.length > 0) result.push([...current])
    if (current.length >= maximumSize) return
    for (let index = start; index < values.length; index += 1) {
      current.push(values[index]!)
      visit(index + 1, current)
      current.pop()
    }
  }
  visit(0, [])
  return result
}

function featureEvidence(
  samples: CalibrationSample[],
  axis: keyof ScreenPoint,
  featureIndices: number[],
) {
  const coordinateGroups = new Map<number, CalibrationSample[]>()
  for (const sample of samples) {
    const coordinate = sample.target[axis]
    coordinateGroups.set(coordinate, [
      ...(coordinateGroups.get(coordinate) ?? []),
      sample,
    ])
  }

  return featureIndices.map((featureIndex) => {
    const groupCenters: number[] = []
    const groupSpreads: number[] = []
    for (const group of coordinateGroups.values()) {
      const values = group.map((sample) => sample.features[featureIndex] ?? 0)
      const center = median(values)
      groupCenters.push(center)
      groupSpreads.push(median(values.map((value) => Math.abs(value - center))))
    }
    const betweenRange = range(groupCenters)
    const withinSpread = median(groupSpreads)
    return {
      featureIndex,
      betweenRange,
      withinSpread,
      discrimination: betweenRange / Math.max(withinSpread * 2, 1e-6),
    }
  })
}

function range(values: number[]) {
  return values.length ? Math.max(...values) - Math.min(...values) : 0
}

function chooseFeatures(
  samples: CalibrationSample[],
  axis: keyof ScreenPoint,
  candidates: number[],
  primary: number[],
  lambdas: number[],
) {
  const evidence = featureEvidence(samples, axis, candidates)
  const viable = new Set(
    evidence
      .filter((item) => item.discrimination >= 1.5)
      .map((item) => item.featureIndex),
  )
  const eligible = candidates.filter(
    (index) => viable.has(index) || primary.includes(index),
  )
  const subsets = combinations(eligible, Math.min(3, eligible.length)).filter(
    (subset) => subset.some((index) => primary.includes(index)),
  )
  const fallback = primary.filter((index) => candidates.includes(index))
  let bestFeatures = subsets[0] ?? fallback
  let bestLambda = lambdas[0] ?? 1e-3
  let bestScore = Number.POSITIVE_INFINITY
  for (const subset of subsets) {
    if (samples.length <= subset.length + 1) continue
    const lambda = selectLambda(samples, axis, subset, lambdas)
    const predictions = axisPredictions(samples, axis, subset, lambda)
    const rmse = axisRmse(samples, predictions, axis)
    const score = rmse * (1 + 0.025 * Math.max(0, subset.length - 1))
    if (score < bestScore) {
      bestScore = score
      bestFeatures = subset
      bestLambda = lambda
    }
  }
  return {
    featureIndices: bestFeatures.length ? bestFeatures : candidates,
    lambda: bestLambda,
    evidence,
    lowEvidence: !evidence.some(
      (item) =>
        primary.includes(item.featureIndex) && item.discrimination >= 1.5,
    ),
  }
}

function axisDiagnostics(
  samples: CalibrationSample[],
  axis: keyof ScreenPoint,
  featureIndices: number[],
  lambda: number,
  evidence: FeatureEvidence[],
  lowEvidence: boolean,
): AxisCalibrationDiagnostics {
  const predictions = axisPredictions(samples, axis, featureIndices, lambda)
  const targets = samples.map((sample) => sample.target[axis])
  const targetMean =
    targets.reduce((sum, value) => sum + value, 0) / targets.length
  const predictionMean =
    predictions.reduce((sum, value) => sum + value, 0) / predictions.length
  const covariance = targets.reduce(
    (sum, target, index) =>
      sum +
      (target - targetMean) * ((predictions[index] ?? 0) - predictionMean),
    0,
  )
  const targetVariance = targets.reduce(
    (sum, target) => sum + (target - targetMean) ** 2,
    0,
  )
  return {
    selectedFeatureIndices: [...featureIndices],
    evidence,
    biasPixels: predictionMean - targetMean,
    gain: targetVariance > 1e-8 ? covariance / targetVariance : 1,
    rmsePixels: axisRmse(samples, predictions, axis),
    lowEvidence,
  }
}

function resolveOptions(
  featureCount: number,
  optionsOrLambda: GazeCalibrationOptions | number,
) {
  const allFeatures = Array.from({ length: featureCount }, (_, index) => index)
  if (typeof optionsOrLambda === "number") {
    return {
      xFeatureIndices: allFeatures,
      yFeatureIndices: allFeatures,
      lambdaCandidates: [optionsOrLambda],
    }
  }
  return {
    xFeatureIndices: optionsOrLambda.xFeatureIndices ?? allFeatures,
    yFeatureIndices: optionsOrLambda.yFeatureIndices ?? allFeatures,
    lambdaCandidates: optionsOrLambda.lambdaCandidates?.length
      ? optionsOrLambda.lambdaCandidates
      : DEFAULT_LAMBDAS,
    adaptiveFeatureSelection: optionsOrLambda.adaptiveFeatureSelection ?? false,
    xPrimaryFeatureIndices: optionsOrLambda.xPrimaryFeatureIndices,
    yPrimaryFeatureIndices: optionsOrLambda.yPrimaryFeatureIndices,
  }
}

export function createCalibrationTargets(
  random: () => number = Math.random,
): NormalizedCalibrationTarget[] {
  const coordinates = [0.1, 0.366, 0.634, 0.9]
  const targets = coordinates.flatMap((y) =>
    coordinates.map((x) => [x, y] as const),
  )
  for (let index = targets.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[targets[index], targets[swapIndex]] = [
      targets[swapIndex] ?? targets[index]!,
      targets[index] ?? targets[swapIndex]!,
    ]
  }
  return targets
}

export function summarizeCalibrationTarget(
  samples: CalibrationSample[],
): CalibrationTargetSummary {
  const featureCount = samples[0]?.features.length
  if (!featureCount || samples.length === 0) {
    throw new Error("Calibration target has no feature samples.")
  }
  if (samples.some((sample) => sample.features.length !== featureCount)) {
    throw new Error("Calibration feature vectors must have equal length.")
  }

  const centers = Array.from({ length: featureCount }, (_, featureIndex) =>
    median(samples.map((sample) => sample.features[featureIndex] ?? 0)),
  )
  const scales = centers.map((center, featureIndex) => {
    const mad = median(
      samples.map((sample) =>
        Math.abs((sample.features[featureIndex] ?? 0) - center),
      ),
    )
    return Math.max(1.4826 * mad, 1e-4)
  })
  const inliers = samples.filter((sample) =>
    sample.features.every(
      (value, featureIndex) =>
        Math.abs(value - (centers[featureIndex] ?? 0)) /
          (scales[featureIndex] ?? 1) <=
        ROBUST_Z_LIMIT,
    ),
  )
  const retained =
    inliers.length >= Math.ceil(samples.length / 2) ? inliers : samples

  return {
    sample: {
      features: Array.from({ length: featureCount }, (_, featureIndex) =>
        median(retained.map((sample) => sample.features[featureIndex] ?? 0)),
      ),
      target: { ...samples[0]!.target },
    },
    retainedFrames: retained.length,
    totalFrames: samples.length,
  }
}

export function fitGazeCalibration(
  samples: CalibrationSample[],
  optionsOrLambda: GazeCalibrationOptions | number = {},
): GazeCalibration {
  const featureCount = samples[0]?.features.length
  if (!featureCount) throw new Error("Calibration needs feature samples.")
  if (samples.some((sample) => sample.features.length !== featureCount)) {
    throw new Error("Calibration feature vectors must have equal length.")
  }

  const options = resolveOptions(featureCount, optionsOrLambda)
  const requiredSamples =
    Math.max(
      options.adaptiveFeatureSelection ? 3 : options.xFeatureIndices.length,
      options.adaptiveFeatureSelection ? 3 : options.yFeatureIndices.length,
    ) + 1
  if (samples.length < requiredSamples) {
    throw new Error("Calibration needs more samples than fitted features.")
  }
  const invalidIndex = [
    ...options.xFeatureIndices,
    ...options.yFeatureIndices,
  ].some((index) => index < 0 || index >= featureCount)
  if (invalidIndex)
    throw new Error("Calibration feature index is out of range.")

  const xChoice = options.adaptiveFeatureSelection
    ? chooseFeatures(
        samples,
        "x",
        options.xFeatureIndices,
        options.xPrimaryFeatureIndices ?? options.xFeatureIndices.slice(0, 1),
        options.lambdaCandidates,
      )
    : {
        featureIndices: options.xFeatureIndices,
        lambda: selectLambda(
          samples,
          "x",
          options.xFeatureIndices,
          options.lambdaCandidates,
        ),
        evidence: featureEvidence(samples, "x", options.xFeatureIndices),
        lowEvidence: false,
      }
  const yChoice = options.adaptiveFeatureSelection
    ? chooseFeatures(
        samples,
        "y",
        options.yFeatureIndices,
        options.yPrimaryFeatureIndices ?? options.yFeatureIndices.slice(0, 1),
        options.lambdaCandidates,
      )
    : {
        featureIndices: options.yFeatureIndices,
        lambda: selectLambda(
          samples,
          "y",
          options.yFeatureIndices,
          options.lambdaCandidates,
        ),
        evidence: featureEvidence(samples, "y", options.yFeatureIndices),
        lowEvidence: false,
      }

  return {
    featureCount,
    xModel: fitAxis(samples, "x", xChoice.featureIndices, xChoice.lambda),
    yModel: fitAxis(samples, "y", yChoice.featureIndices, yChoice.lambda),
    diagnostics: {
      x: axisDiagnostics(
        samples,
        "x",
        xChoice.featureIndices,
        xChoice.lambda,
        xChoice.evidence,
        xChoice.lowEvidence,
      ),
      y: axisDiagnostics(
        samples,
        "y",
        yChoice.featureIndices,
        yChoice.lambda,
        yChoice.evidence,
        yChoice.lowEvidence,
      ),
    },
  }
}

export function leaveOneTargetOutResiduals(
  samples: CalibrationSample[],
  calibration: GazeCalibration,
) {
  return samples.map((heldOut, heldOutIndex) => {
    const training = samples.filter((_, index) => index !== heldOutIndex)
    const xModel = fitAxis(
      training,
      "x",
      calibration.xModel.featureIndices,
      calibration.xModel.lambda,
    )
    const yModel = fitAxis(
      training,
      "y",
      calibration.yModel.featureIndices,
      calibration.yModel.lambda,
    )
    return Math.hypot(
      predictAxis(xModel, heldOut.features) - heldOut.target.x,
      predictAxis(yModel, heldOut.features) - heldOut.target.y,
    )
  })
}

export function predictGaze(
  calibration: GazeCalibration,
  features: number[],
): ScreenPoint {
  if (features.length !== calibration.featureCount) {
    throw new Error(
      `Expected ${calibration.featureCount} gaze features, received ${features.length}.`,
    )
  }
  return {
    x: predictAxis(calibration.xModel, features),
    y: predictAxis(calibration.yModel, features),
  }
}
