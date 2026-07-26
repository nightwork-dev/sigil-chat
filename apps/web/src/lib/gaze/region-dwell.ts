// Debouncing which region the gaze has settled on.
//
// Raw gaze jitters across region boundaries many times a second; committing
// every candidate would spray the attention envelope with noise and make the
// portrait's acknowledgement flicker. This latch commits a region id only once
// the gaze has stayed on it continuously for a dwell — the same idea as the
// lab's HysteresisQuantizer, but keyed on DOM region identity (from
// elementFromPoint) rather than screen rects, because product regions opt in
// by identity, not by fixed geometry.
//
// `null` is a first-class candidate: looking at empty chrome for the dwell
// commits "nothing", which is how gaze correctly stops surfacing a region you
// have looked away from.
//
// Pure: the caller supplies the clock.

export const GAZE_REGION_DWELL_MS = 220

export class GazeRegionDwell {
  private committed: string | null = null
  private candidate: string | null = null
  private candidateSince = 0

  constructor(private readonly dwellMs = GAZE_REGION_DWELL_MS) {}

  reset(): void {
    this.committed = null
    this.candidate = null
    this.candidateSince = 0
  }

  /**
   * Feed the region id under the current gaze point (or null for none) plus the
   * timestamp. Returns the currently committed region id — unchanged until a
   * new candidate has persisted for the dwell.
   */
  update(regionId: string | null, timeMs: number): string | null {
    if (regionId === this.committed) {
      // Already committed; a flicker back to it cancels any pending change.
      this.candidate = this.committed
      this.candidateSince = timeMs
      return this.committed
    }
    if (regionId !== this.candidate) {
      this.candidate = regionId
      this.candidateSince = timeMs
      return this.committed
    }
    if (timeMs - this.candidateSince >= this.dwellMs) {
      this.committed = regionId
      return this.committed
    }
    return this.committed
  }

  current(): string | null {
    return this.committed
  }
}
