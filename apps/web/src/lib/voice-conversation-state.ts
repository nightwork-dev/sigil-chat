// Voice-conversation mode's two states and what each one looks like.
//
// A third pure state module beside `voice-control-state` (dictation) and
// `voice-live-state` (the live call), for the same reason those two are
// separate from each other: three controls sit in one composer row, and a user
// must be able to tell at a glance which promise they are in. Dictation
// captures an utterance and hands back editable text. A live call opens a
// duplex channel to a SEPARATE, capability-limited voice agent. Voice
// conversation is the real Eve agent — the same persona, memory, tools,
// approvals, and transcript as typing — reached by talking, one turn at a
// time.
//
// The mode is binary, so this is deliberately smaller than its siblings: no
// motion vocabulary (nothing here is an unfinished process — the mic and the
// player own the in-flight states), and no error state, because the one way
// this control can refuse is "a live call is already up", which is a message
// the component renders beside itself rather than a mode you can be stuck in.
//
// Pure: no DOM, no React, no fetch.

export const VOICE_CONVERSATION_MODES = ["off", "on"] as const

export type VoiceConversationMode = (typeof VOICE_CONVERSATION_MODES)[number]

export function voiceConversationMode(active: boolean): VoiceConversationMode {
  return active ? "on" : "off"
}

export interface VoiceConversationPresentation {
  readonly mode: VoiceConversationMode
  /** What clicking does now. Reversing the mode is always this one action. */
  readonly action: "enable" | "disable"
  /** Accessible name and tooltip. Unique per mode, and each says what the
   *  mode actually changes rather than naming the feature. */
  readonly label: string
  /** Shown beside the glyph only in `on`. A readout that changes with state
   *  is information; a permanent one would be decoration. */
  readonly readout?: string
  /** One glyph for both modes — a speaking head, distinct from dictation's
   *  microphone and the live call's waveform. Tone carries on/off; a second
   *  glyph would make one control look like two. */
  readonly icon: "speech"
  /** `primary` is the active/on state everywhere in this app, muted is
   *  resting. No third palette. */
  readonly tone: "muted" | "primary"
}

const PRESENTATION: Record<
  VoiceConversationMode,
  VoiceConversationPresentation
> = {
  off: {
    mode: "off",
    action: "enable",
    label: "Start a voice conversation — dictation sends, replies are spoken",
    icon: "speech",
    tone: "muted",
  },
  on: {
    mode: "on",
    action: "disable",
    label: "Voice conversation on — turn off",
    readout: "Voice",
    icon: "speech",
    tone: "primary",
  },
}

export function voiceConversationPresentation(
  mode: VoiceConversationMode,
): VoiceConversationPresentation {
  return PRESENTATION[mode]
}
