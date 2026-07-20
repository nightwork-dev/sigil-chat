export interface PinchTransition {
  pinched: boolean
  changed: boolean
  type: "start" | "end" | null
}

/**
 * A pinch is deliberately asymmetric: it must cross the stronger start
 * threshold to engage, then fall below the lower release threshold to end.
 * That dead band prevents one trembling fingertip distance from click-spamming.
 */
export class PinchHysteresis {
  private pinched = false

  constructor(
    private readonly startThreshold = 0.72,
    private readonly releaseThreshold = 0.48,
  ) {
    if (releaseThreshold >= startThreshold) {
      throw new Error("Pinch release threshold must be below start threshold.")
    }
  }

  reset() {
    this.pinched = false
  }

  update(strength: number): PinchTransition {
    if (!this.pinched && strength >= this.startThreshold) {
      this.pinched = true
      return { pinched: true, changed: true, type: "start" }
    }
    if (this.pinched && strength <= this.releaseThreshold) {
      this.pinched = false
      return { pinched: false, changed: true, type: "end" }
    }
    return { pinched: this.pinched, changed: false, type: null }
  }
}
