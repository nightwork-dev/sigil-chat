// The decay latch that keeps a gazed region in the attention envelope for a
// short window AFTER the gaze leaves it.
//
// Without this the gaze region is a one-shot: it vanishes the instant the gaze
// moves off a known region, so a follow-up turn ("what about now?") composed a
// second later — while the user's eyes are on the composer, not a registered
// region — drops the gaze the previous turn carried. Holding the last region
// for a few seconds means the recent gaze is still in context for that natural
// follow-up, then clears on its own once the gaze has genuinely moved on.
//
// Pure: the caller supplies the clock (the capture loop's frame timestamp), so
// the window is testable without timers. meet-gaze and the focus indicator use
// the LIVE region separately — this latch governs only what ATTENTION carries.

import type { GazeRegionDescriptor } from "./gaze-region"

/** How long a gazed region stays in the attention envelope after the gaze
 *  leaves it. Long enough to survive composing a one-line follow-up, short
 *  enough that stale gaze doesn't linger into an unrelated turn. */
export const GAZE_ATTENTION_DECAY_MS = 4000

export interface GazeDecayState {
  /** The region attention currently carries, or null once decayed/never set. */
  readonly region: GazeRegionDescriptor | null
  /** When `region` was last observed under the live gaze. */
  readonly lastSeenAt: number
}

export function initialGazeDecayState(): GazeDecayState {
  return { region: null, lastSeenAt: 0 }
}

/**
 * Advance the latch for one observation.
 *
 * - A live region (`observed` non-null) refreshes the latch: that region is
 *   carried and its clock resets to `now`.
 * - A null observation (gaze on nothing that opted in) KEEPS the held region
 *   until `windowMs` has elapsed since it was last seen, then clears it.
 * - Once cleared, further null observations are stable (no region to hold).
 */
export function advanceGazeDecay(
  state: GazeDecayState,
  observed: GazeRegionDescriptor | null,
  now: number,
  windowMs = GAZE_ATTENTION_DECAY_MS,
): GazeDecayState {
  if (observed) return { region: observed, lastSeenAt: now }
  if (!state.region) return state
  if (now - state.lastSeenAt >= windowMs) {
    return { region: null, lastSeenAt: state.lastSeenAt }
  }
  return state
}
