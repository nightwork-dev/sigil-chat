export interface FixationStatus {
  stable: boolean
  frames: number
  worstRatio: number
}

export interface FixationOptions {
  windowFrames?: number
  eyeRange?: number
  poseRangeDegrees?: number
  translationRange?: number
}

const EYE_INDICES = [0, 1, 2, 3]
const POSE_INDICES = [6, 7, 8]
const TRANSLATION_INDICES = [9, 10]

function range(values: number[]) {
  return Math.max(...values) - Math.min(...values)
}

export class FixationSettler {
  private readonly windowFrames: number
  private readonly thresholds: Map<number, number>
  private frames: number[][] = []

  constructor(options: FixationOptions = {}) {
    this.windowFrames = options.windowFrames ?? 7
    this.thresholds = new Map([
      ...EYE_INDICES.map(
        (index) => [index, options.eyeRange ?? 0.035] as const,
      ),
      ...POSE_INDICES.map(
        (index) => [index, options.poseRangeDegrees ?? 2.2] as const,
      ),
      ...TRANSLATION_INDICES.map(
        (index) => [index, options.translationRange ?? 0.025] as const,
      ),
    ])
  }

  reset() {
    this.frames = []
  }

  update(features: number[]): FixationStatus {
    this.frames.push([...features])
    if (this.frames.length > this.windowFrames) this.frames.shift()

    let worstRatio = 0
    for (const [featureIndex, threshold] of this.thresholds) {
      const featureRange = range(
        this.frames.map((frame) => frame[featureIndex] ?? 0),
      )
      worstRatio = Math.max(worstRatio, featureRange / threshold)
    }

    return {
      stable: this.frames.length >= this.windowFrames && worstRatio <= 1,
      frames: this.frames.length,
      worstRatio,
    }
  }
}
