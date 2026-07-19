import type { ScreenPoint } from "./calibration"

export interface CorrectionAnchor {
  predicted: ScreenPoint
  target: ScreenPoint
  visits: number
}

export interface CorrectionFieldOptions {
  radius?: number
  mergeDistance?: number
  maxAnchors?: number
}

export class LocalCorrectionField {
  private readonly radius: number
  private readonly mergeDistance: number
  private readonly maxAnchors: number
  private anchors: CorrectionAnchor[] = []

  constructor(options: CorrectionFieldOptions = {}) {
    this.radius = options.radius ?? 320
    this.mergeDistance = options.mergeDistance ?? 72
    this.maxAnchors = options.maxAnchors ?? 24
  }

  clear() {
    this.anchors = []
  }

  getAnchors() {
    return this.anchors.map((anchor) => ({
      predicted: { ...anchor.predicted },
      target: { ...anchor.target },
      visits: anchor.visits,
    }))
  }

  teach(predicted: ScreenPoint, target: ScreenPoint) {
    const nearestIndex = this.anchors.findIndex(
      (anchor) =>
        Math.hypot(anchor.target.x - target.x, anchor.target.y - target.y) <=
        this.mergeDistance,
    )
    if (nearestIndex >= 0) {
      const previous = this.anchors[nearestIndex]!
      const visits = previous.visits + 1
      this.anchors[nearestIndex] = {
        predicted: {
          x: (previous.predicted.x * previous.visits + predicted.x) / visits,
          y: (previous.predicted.y * previous.visits + predicted.y) / visits,
        },
        target: {
          x: (previous.target.x * previous.visits + target.x) / visits,
          y: (previous.target.y * previous.visits + target.y) / visits,
        },
        visits,
      }
      return
    }

    this.anchors.push({
      predicted: { ...predicted },
      target: { ...target },
      visits: 1,
    })
    if (this.anchors.length > this.maxAnchors) this.anchors.shift()
  }

  apply(point: ScreenPoint): ScreenPoint {
    let weightSum = 0
    let dx = 0
    let dy = 0
    for (const anchor of this.anchors) {
      const distance = Math.hypot(
        anchor.predicted.x - point.x,
        anchor.predicted.y - point.y,
      )
      if (distance >= this.radius) continue
      const proximity = Math.exp(-3 * (distance / this.radius) ** 2)
      const visitConfidence = 1 - Math.exp(-0.7 * anchor.visits)
      const weight = proximity * visitConfidence
      weightSum += weight
      dx += (anchor.target.x - anchor.predicted.x) * weight
      dy += (anchor.target.y - anchor.predicted.y) * weight
    }
    if (weightSum === 0) return { ...point }
    const boundedWeight = Math.min(1, weightSum)
    return {
      x: point.x + (dx / weightSum) * boundedWeight,
      y: point.y + (dy / weightSum) * boundedWeight,
    }
  }
}
