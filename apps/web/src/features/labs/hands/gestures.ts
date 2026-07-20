import type { HandGesture } from "./features"

export type ConfirmedGesture = Exclude<HandGesture, "grab" | null>

export interface GestureDwellState {
  candidate: ConfirmedGesture | null
  progress: number
  confirmed: ConfirmedGesture | null
}

/** Confirms a recognized gesture only after it remains stable for dwellMs. */
export class GestureDwell {
  private candidate: ConfirmedGesture | null = null
  private startedAt = 0
  private armed = true

  constructor(private readonly dwellMs = 650) {}

  reset() {
    this.candidate = null
    this.startedAt = 0
    this.armed = true
  }

  update(gesture: HandGesture, now: number): GestureDwellState {
    const next =
      gesture === "open-palm" || gesture === "thumbs-up" || gesture === "point"
        ? gesture
        : null

    if (next !== this.candidate) {
      this.candidate = next
      this.startedAt = now
      this.armed = true
    }

    if (!this.candidate) {
      return { candidate: null, progress: 0, confirmed: null }
    }

    const progress = Math.max(
      0,
      Math.min(1, (now - this.startedAt) / this.dwellMs),
    )
    if (progress >= 1 && this.armed) {
      this.armed = false
      return {
        candidate: this.candidate,
        progress: 1,
        confirmed: this.candidate,
      }
    }
    return { candidate: this.candidate, progress, confirmed: null }
  }
}
