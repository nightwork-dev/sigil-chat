// Bounded progress projection — what the coordinator may say while Eve works.
//
// Eve emits progress far faster than a person can read or a voice can speak,
// and the coordinator spec makes the projection bounded on purpose. Two rules
// carry that:
//
//   1. Rapid updates COALESCE. Narration arriving inside the coalesce window
//      replaces the previous line rather than appending, so a burst of tool
//      chatter reads as one moving line, not a wall. The window is time-based
//      rather than count-based because it has to behave the same whether the
//      reader is watching a transcript or listening to it.
//   2. A final result SUPERSEDES intermediate narration. Once the turn has an
//      answer, the half-finished narration that preceded it is stale — keeping
//      it around invites reading out "searching the repository…" after the
//      answer already landed.
//
// This module is pure: same inputs, same projection, no clock of its own. The
// caller supplies `at`, which is what lets a late-arriving progress event be
// recognized as stale instead of overwriting a newer result.

/** One line of user-facing narration, with the time it was observed. */
export interface ProgressLine {
  readonly text: string
  readonly at: number
}

export interface ProgressProjection {
  /** Bounded, oldest-first. Empty once a final result has superseded it. */
  readonly narration: readonly ProgressLine[]
  /** The turn's answer. Present only after a final update. */
  readonly final?: ProgressLine
}

export type ProgressUpdate =
  | { readonly kind: "progress"; readonly text: string; readonly at: number }
  | { readonly kind: "final"; readonly text: string; readonly at: number }

export interface ProgressBounds {
  /** Most narration lines retained; the oldest fall off first. */
  readonly maxLines: number
  /** Updates this close to the previous one replace it instead of appending. */
  readonly coalesceWindowMs: number
}

export const PROGRESS_BOUNDS: ProgressBounds = {
  maxLines: 3,
  coalesceWindowMs: 400,
}

export const EMPTY_PROGRESS: ProgressProjection = { narration: [] }

/**
 * Fold one update into a projection. Never throws; an update with no
 * meaningful text is dropped rather than projected as an empty line.
 */
export function projectProgress(
  current: ProgressProjection,
  update: ProgressUpdate,
  bounds: ProgressBounds = PROGRESS_BOUNDS,
): ProgressProjection {
  const text = update.text.trim()
  if (!text) return current

  if (update.kind === "final") {
    // A final result clears the narration it supersedes. An out-of-order final
    // (one older than a final already projected) is ignored.
    if (current.final && current.final.at > update.at) return current
    return { narration: [], final: { text, at: update.at } }
  }

  // Narration observed before the final it would follow is stale by
  // definition — the answer is already on screen.
  if (current.final && current.final.at >= update.at) return current
  // Genuinely newer narration means the next turn has begun, so the answered
  // turn's projection gives way to it rather than the two stacking. The
  // transcript keeps the answer; this projection is only what's live now.
  if (current.final) return { narration: [{ text, at: update.at }] }

  const previous = current.narration[current.narration.length - 1]
  const coalesces =
    previous !== undefined && update.at - previous.at < bounds.coalesceWindowMs

  const appended = coalesces
    ? [...current.narration.slice(0, -1), { text, at: update.at }]
    : [...current.narration, { text, at: update.at }]

  return {
    narration:
      appended.length > bounds.maxLines
        ? appended.slice(appended.length - bounds.maxLines)
        : appended,
  }
}

/** The single line a speech or status surface should present right now. */
export function currentProgressLine(
  projection: ProgressProjection,
): string | undefined {
  if (projection.final) return projection.final.text
  return projection.narration[projection.narration.length - 1]?.text
}
