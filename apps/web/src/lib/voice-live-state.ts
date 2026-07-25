// Live voice's own states — deliberately NOT dictation's five.
//
// Dictation and a live call are different promises. Dictation captures an
// utterance and hands back text you can edit; a live call opens a duplex
// channel where the agent talks back. Folding a sixth state into
// `voice-control-state` would make one control mean two things, and the state
// a user is in ("am I dictating or am I on a call?") is exactly the thing that
// must never be ambiguous. So this is a separate, smaller machine on a
// separate control, and the two share only the rule that stopping is always
// one action away.
//
// Pure: no DOM, no React, no fetch.

export const LIVE_VOICE_STATES = [
  "idle",
  "connecting",
  "live",
  "error",
] as const

export type LiveVoiceState = (typeof LIVE_VOICE_STATES)[number]

/** States in which the app holds, or is asking to hold, the microphone.
 *  Every one of them must offer a way out. */
export const LIVE_VOICE_ACTIVE_STATES = [
  "connecting",
  "live",
] as const satisfies readonly LiveVoiceState[]

export function isLiveVoiceActive(state: LiveVoiceState): boolean {
  return (LIVE_VOICE_ACTIVE_STATES as readonly LiveVoiceState[]).includes(state)
}

export type LiveVoiceEvent =
  /** The user asked to open a call. */
  | "start"
  /** Negotiation finished; audio is flowing both ways. */
  | "connected"
  /** The user hung up, from any active state. */
  | "stop"
  /** Permission refused, negotiation failed, or the host refused the call. */
  | "fail"

/**
 * Total function: an event that makes no sense in the current state leaves it
 * alone. `stop` is accepted everywhere — that is the "no state traps the user
 * in a call" property, expressed where a test can reach it.
 */
export function nextLiveVoiceState(
  state: LiveVoiceState,
  event: LiveVoiceEvent,
): LiveVoiceState {
  if (event === "stop") return "idle"
  if (event === "fail") return "error"
  switch (event) {
    case "start":
      return state === "idle" || state === "error" ? "connecting" : state
    case "connected":
      return state === "connecting" ? "live" : state
  }
}

export type LiveVoiceAction = "start" | "stop"

export interface LiveVoicePresentation {
  readonly state: LiveVoiceState
  readonly action: LiveVoiceAction
  /** Accessible name and tooltip. Unique per state, and every label says
   *  "voice call" or "live voice" so it can never be read as dictation. */
  readonly label: string
  readonly icon: "waveform" | "spinner" | "hang-up"
  readonly tone: "muted" | "primary" | "destructive"
  readonly motion: "none" | "pulse" | "spin"
}

const PRESENTATION: Record<LiveVoiceState, LiveVoicePresentation> = {
  idle: {
    state: "idle",
    action: "start",
    // A waveform, not a microphone: the mic beside it already means "dictate",
    // and two mics in one row would be two controls claiming one meaning.
    icon: "waveform",
    // "Experimental, separate voice agent" is a capability disclosure, not
    // hedging: the call currently opens its own codex realtime thread and
    // does NOT share this thread's agent, memory, or tools (see
    // LIVE-VOICE-HARNESS-ASSESSMENT). The label may only lose that clause
    // when the P2 binding makes it untrue.
    label: "Start a live voice call (experimental, separate voice agent)",
    motion: "none",
    tone: "muted",
  },
  connecting: {
    state: "connecting",
    action: "stop",
    icon: "spinner",
    label: "Connecting live voice — cancel",
    // Spin, because a negotiation is genuinely in flight and unfinished
    // process is the only thing motion is allowed to mean here.
    motion: "spin",
    tone: "muted",
  },
  live: {
    state: "live",
    action: "stop",
    // A hang-up glyph, because ending a call is the one thing this button
    // does while a call is up, and "stop" ambiguity costs seconds mid-call.
    icon: "hang-up",
    label: "Live voice call — end call",
    // No animation on a live call: the primary tone already carries "on", and
    // a control that pulses for minutes becomes furniture.
    motion: "none",
    // `primary` is "on/active" everywhere else in the app; this is that.
    tone: "primary",
  },
  error: {
    state: "error",
    action: "start",
    icon: "waveform",
    label: "Live voice failed — try again",
    motion: "none",
    // `destructive` is "failed" everywhere else in the app; this is that.
    tone: "destructive",
  },
}

export function liveVoicePresentation(
  state: LiveVoiceState,
): LiveVoicePresentation {
  return PRESENTATION[state]
}
