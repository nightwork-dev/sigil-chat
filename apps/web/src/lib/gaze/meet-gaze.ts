// Meeting the user's gaze (VOX.7 capability 2), as pure state.
//
// Two things live here, both advisory, both derived from one input — "is the
// gaze point on the agent's portrait right now?":
//
//   1. Acknowledgement — a dwell latch with hysteresis. The portrait
//      acknowledges being looked at only after the gaze RESTS on it (a glance
//      sweeping across it is not eye contact), and only lets go after the gaze
//      has left for a moment (so a single noisy frame off-target doesn't make
//      the acknowledgement flicker). This is what the portrait's presence
//      affordance reads.
//
//   2. Addressee — in a voice conversation, looking at the agent while you
//      speak disambiguates "I'm talking to you" from "I'm talking near you".
//      It is metadata on the turn, never a gate: the turn is still Eve's turn
//      whether or not you met its gaze.
//
// Pure: no DOM, no React, no time source of its own — the caller supplies `t`.

/** Rest this long on the portrait before eye contact registers. Long enough
 *  that a sweep across the portrait doesn't count, short enough to feel like a
 *  response rather than a delay. */
export const MEET_GAZE_DWELL_MS = 600

/** Stay off the portrait this long before eye contact releases. Shorter than
 *  the dwell, and non-zero so one stray off-target frame can't drop it. */
export const MEET_GAZE_RELEASE_MS = 400

export interface MeetGazeState {
  /** Whether the most recent sample had gaze on the portrait. */
  readonly onPortrait: boolean
  /** Timestamp the current on/off streak began. */
  readonly since: number
  /** The latched, hysteretic result the UI reads. */
  readonly acknowledged: boolean
}

export interface MeetGazeSample {
  readonly onPortrait: boolean
  readonly t: number
}

export function initialMeetGazeState(): MeetGazeState {
  return { onPortrait: false, since: 0, acknowledged: false }
}

/**
 * Advance the latch by one sample. A change in on/off starts a fresh streak
 * (the latch itself does not move yet); a continuing streak flips the latch
 * once it has lasted the relevant threshold.
 */
export function advanceMeetGaze(
  state: MeetGazeState,
  sample: MeetGazeSample,
): MeetGazeState {
  if (sample.onPortrait !== state.onPortrait) {
    return { onPortrait: sample.onPortrait, since: sample.t, acknowledged: state.acknowledged }
  }

  const elapsed = sample.t - state.since

  if (sample.onPortrait && !state.acknowledged && elapsed >= MEET_GAZE_DWELL_MS) {
    return { ...state, acknowledged: true }
  }
  if (!sample.onPortrait && state.acknowledged && elapsed >= MEET_GAZE_RELEASE_MS) {
    return { ...state, acknowledged: false }
  }
  return state
}

/**
 * The advisory addressee for a turn. `"agent"` only when a voice conversation
 * is active AND the user has met the agent's gaze; otherwise undefined (no
 * claim). Never returned as authorization — a turn without it is still valid.
 */
export function gazeVoiceAddressee(input: {
  readonly acknowledged: boolean
  readonly conversationActive: boolean
}): "agent" | undefined {
  return input.conversationActive && input.acknowledged ? "agent" : undefined
}
