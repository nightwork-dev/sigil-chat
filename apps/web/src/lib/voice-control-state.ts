// The mic control's states, and what each one looks like — one place.
//
// The composer's dictation control is the only surface where a user can hand
// the microphone to the app, so every state it can be in has to be legible
// from the control itself: whether the browser is still deciding, whether the
// mic is live, whether a transcript is on its way, and whether the last
// attempt failed. The spec fixes the list (COORDINATOR-AND-HALF-DUPLEX-VOICE
// "User experience"); this module is that list plus its presentation, so a
// component never invents a sixth state and a test never hardcodes a count.
//
// Pure: no DOM, no React, no fetch. The capture machinery that drives these
// transitions lives in voice-dictation.ts.

export const VOICE_CONTROL_STATES = [
  "idle",
  "requesting-microphone",
  "listening",
  "transcribing",
  "error",
] as const

export type VoiceControlState = (typeof VOICE_CONTROL_STATES)[number]

/**
 * States in which the app is holding, or asking to hold, the microphone.
 * Every one of these MUST expose a way out — no state traps the user in
 * capture (spec: "stopping is always one action away").
 */
export const VOICE_CAPTURE_ACTIVE_STATES = [
  "requesting-microphone",
  "listening",
  "transcribing",
] as const satisfies readonly VoiceControlState[]

export function isVoiceCaptureActive(state: VoiceControlState): boolean {
  return (VOICE_CAPTURE_ACTIVE_STATES as readonly VoiceControlState[]).includes(
    state,
  )
}

export type VoiceControlEvent =
  /** The user asked to dictate. */
  | "start"
  /** The browser granted the microphone and capture is live. */
  | "microphone-granted"
  /** The utterance ended; audio is on its way to transcription. */
  | "capture-ended"
  /** A transcript came back (or came back empty) — dictation is over. */
  | "transcribed"
  /** The user backed out, from any active state. */
  | "cancel"
  /** Permission refused, device error, or transcription failure. */
  | "fail"

/**
 * The state machine, as a total function: an event that makes no sense in the
 * current state leaves the state alone rather than inventing a transition.
 * `cancel` is deliberately accepted from every state — that is the property
 * "no state traps the user in capture", expressed where it can be tested.
 */
export function nextVoiceControlState(
  state: VoiceControlState,
  event: VoiceControlEvent,
): VoiceControlState {
  if (event === "cancel") return "idle"
  if (event === "fail") return "error"
  switch (event) {
    case "start":
      return state === "idle" || state === "error"
        ? "requesting-microphone"
        : state
    case "microphone-granted":
      return state === "requesting-microphone" ? "listening" : state
    case "capture-ended":
      return state === "listening" ? "transcribing" : state
    case "transcribed":
      return state === "transcribing" ? "idle" : state
  }
}

/** What clicking the control does in a given state. */
export type VoiceControlAction = "start" | "stop"

export interface VoiceControlPresentation {
  readonly state: VoiceControlState
  readonly action: VoiceControlAction
  /** Accessible name — also the control's tooltip. Unique per state. */
  readonly label: string
  readonly icon: "mic" | "stop" | "spinner" | "mic-off"
  /** Semantic tone, mapped to a token by the component. `primary` means
   *  "on/active" and `destructive` means "failed", exactly as everywhere
   *  else in the app. */
  readonly tone: "muted" | "primary" | "destructive"
  /** Motion encodes an unfinished process and nothing else: `pulse` while a
   *  permission decision is outstanding, `spin` while a transcript is in
   *  flight, none when the control is simply resting or live. */
  readonly motion: "none" | "pulse" | "spin"
}

const PRESENTATION: Record<VoiceControlState, VoiceControlPresentation> = {
  idle: {
    state: "idle",
    action: "start",
    label: "Start dictation",
    icon: "mic",
    tone: "muted",
    motion: "none",
  },
  "requesting-microphone": {
    state: "requesting-microphone",
    action: "stop",
    label: "Waiting for microphone access — cancel",
    icon: "mic",
    tone: "muted",
    motion: "pulse",
  },
  listening: {
    state: "listening",
    action: "stop",
    label: "Listening — stop and transcribe",
    icon: "stop",
    tone: "primary",
    motion: "none",
  },
  transcribing: {
    state: "transcribing",
    action: "stop",
    label: "Transcribing — cancel",
    icon: "spinner",
    tone: "muted",
    motion: "spin",
  },
  error: {
    state: "error",
    action: "start",
    label: "Dictation failed — try again",
    icon: "mic-off",
    tone: "destructive",
    motion: "none",
  },
}

export function voiceControlPresentation(
  state: VoiceControlState,
): VoiceControlPresentation {
  return PRESENTATION[state]
}
