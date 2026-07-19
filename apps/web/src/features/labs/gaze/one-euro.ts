export interface OneEuroOptions {
  minCutoff: number
  beta: number
  dCutoff: number
}

const DEFAULT_OPTIONS: OneEuroOptions = {
  minCutoff: 1,
  beta: 0.007,
  dCutoff: 1,
}

function smoothingAlpha(cutoff: number, deltaSeconds: number) {
  const tau = 1 / (2 * Math.PI * Math.max(cutoff, 1e-6))
  return 1 / (1 + tau / Math.max(deltaSeconds, 1e-6))
}

export class OneEuroFilter {
  private previousTime: number | null = null
  private previousValue: number | null = null
  private previousDerivative = 0

  constructor(private options: OneEuroOptions = DEFAULT_OPTIONS) {}

  setOptions(options: OneEuroOptions) {
    this.options = options
  }

  reset() {
    this.previousTime = null
    this.previousValue = null
    this.previousDerivative = 0
  }

  filter(value: number, timeMs: number) {
    if (this.previousTime === null || this.previousValue === null) {
      this.previousTime = timeMs
      this.previousValue = value
      return value
    }

    const deltaSeconds = Math.max((timeMs - this.previousTime) / 1000, 1e-6)
    const derivative = (value - this.previousValue) / deltaSeconds
    const derivativeAlpha = smoothingAlpha(this.options.dCutoff, deltaSeconds)
    const smoothedDerivative =
      derivativeAlpha * derivative +
      (1 - derivativeAlpha) * this.previousDerivative
    const cutoff =
      this.options.minCutoff + this.options.beta * Math.abs(smoothedDerivative)
    const valueAlpha = smoothingAlpha(cutoff, deltaSeconds)
    const smoothedValue =
      valueAlpha * value + (1 - valueAlpha) * this.previousValue

    this.previousTime = timeMs
    this.previousValue = smoothedValue
    this.previousDerivative = smoothedDerivative
    return smoothedValue
  }
}
