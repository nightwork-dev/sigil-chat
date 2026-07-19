export interface ScreenPoint {
  x: number
  y: number
}

export interface CalibrationSample {
  features: number[]
  target: ScreenPoint
}

export interface GazeCalibration {
  featureCount: number
  lambda: number
  xWeights: number[]
  yWeights: number[]
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

export function fitGazeCalibration(
  samples: CalibrationSample[],
  lambda = 1e-3,
): GazeCalibration {
  const featureCount = samples[0]?.features.length
  if (!featureCount || samples.length < featureCount + 1) {
    throw new Error("Calibration needs more samples than fitted features.")
  }
  if (samples.some((sample) => sample.features.length !== featureCount)) {
    throw new Error("Calibration feature vectors must have equal length.")
  }

  const columnCount = featureCount + 1
  const gram = Array.from({ length: columnCount }, () =>
    Array.from({ length: columnCount }, () => 0),
  )
  const xProjection = Array.from({ length: columnCount }, () => 0)
  const yProjection = Array.from({ length: columnCount }, () => 0)

  for (const sample of samples) {
    const row = [...sample.features, 1]
    for (let left = 0; left < columnCount; left += 1) {
      xProjection[left] =
        (xProjection[left] ?? 0) + (row[left] ?? 0) * sample.target.x
      yProjection[left] =
        (yProjection[left] ?? 0) + (row[left] ?? 0) * sample.target.y
      for (let right = 0; right < columnCount; right += 1) {
        const gramRow = gram[left]
        if (gramRow) {
          gramRow[right] =
            (gramRow[right] ?? 0) + (row[left] ?? 0) * (row[right] ?? 0)
        }
      }
    }
  }

  // Ridge-regularize feature weights but not the bias column.
  for (let index = 0; index < featureCount; index += 1) {
    const row = gram[index]
    if (row) row[index] = (row[index] ?? 0) + lambda
  }

  return {
    featureCount,
    lambda,
    xWeights: solveLinearSystem(
      gram.map((row) => [...row]),
      xProjection,
    ),
    yWeights: solveLinearSystem(
      gram.map((row) => [...row]),
      yProjection,
    ),
  }
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
  const row = [...features, 1]
  return {
    x: row.reduce(
      (sum, value, index) => sum + value * (calibration.xWeights[index] ?? 0),
      0,
    ),
    y: row.reduce(
      (sum, value, index) => sum + value * (calibration.yWeights[index] ?? 0),
      0,
    ),
  }
}
