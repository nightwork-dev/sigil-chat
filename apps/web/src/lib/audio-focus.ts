// One voice channel at a time.
//
// STT capture and TTS playback share a physical channel: a speaker playing
// the agent's voice bleeds into the microphone, and a user talking over
// playback can't hear what's being said either way. Starting capture must
// therefore pause any playback in flight, and playback must not resume while
// capture is active. This module owns only that coordination — it never
// creates or holds the audio elements/tracks themselves, so it stays pure
// and testable with a fake playback handle.

export interface PlaybackHandle {
  readonly pause: () => void
}

/** The two features that can own the voice channel as a MODE — a state the
 *  user enters and leaves, as opposed to a single capture or playback. They
 *  are mutually exclusive by construction: a live call and a spoken
 *  conversation would both be talking and listening on one device with no way
 *  to tell which one an utterance belonged to. */
export type VoiceModeOwner = "live-call" | "voice-conversation"

export interface AudioFocusManager {
  /** Register the current TTS playback handle, replacing any prior one.
   *  Pass undefined when playback has ended to clear the registration. */
  readonly registerPlayback: (handle: PlaybackHandle | undefined) => void
  /** Claim capture focus: pauses any registered playback and marks capture
   *  active. Idempotent. */
  readonly startCapture: () => void
  readonly stopCapture: () => void
  /** The playback owner calls this once it has actually started rendering
   *  audio. Focus wins: while capture is active this is a no-op, so the
   *  manager's own invariant (never both active) cannot be defeated by a
   *  playback owner that ignores pause(). */
  readonly notifyPlaybackStarted: () => void
  readonly notifyPlaybackStopped: () => void
  readonly isCapturing: () => boolean
  readonly isPlaying: () => boolean
  /** Take the exclusive voice mode. Returns false when the OTHER mode already
   *  holds it — the caller must then refuse and say so, never proceed. Taking
   *  a mode you already hold succeeds and changes nothing. */
  readonly claimMode: (owner: VoiceModeOwner) => boolean
  /** Give up a mode. A release from a non-owner is ignored, so a component
   *  unmounting cannot free a mode another feature is still in. */
  readonly releaseMode: (owner: VoiceModeOwner) => void
  readonly modeOwner: () => VoiceModeOwner | undefined
}

export function createAudioFocusManager(): AudioFocusManager {
  let playback: PlaybackHandle | undefined
  let capturing = false
  let playing = false
  let mode: VoiceModeOwner | undefined

  return {
    registerPlayback(handle) {
      playback = handle
    },
    startCapture() {
      playback?.pause()
      playing = false
      capturing = true
    },
    stopCapture() {
      capturing = false
    },
    notifyPlaybackStarted() {
      if (capturing) return
      playing = true
    },
    notifyPlaybackStopped() {
      playing = false
    },
    isCapturing: () => capturing,
    isPlaying: () => playing,
    claimMode(owner) {
      if (mode !== undefined && mode !== owner) return false
      mode = owner
      return true
    },
    releaseMode(owner) {
      if (mode === owner) mode = undefined
    },
    modeOwner: () => mode,
  }
}

/** The app's one audio channel. Dictation and a live duplex call are separate
 *  features on separate controls, but they share one microphone and one pair
 *  of speakers — so they have to share one manager, or the coordination this
 *  module exists for is coordination between a component and itself. */
export const voiceAudioFocus: AudioFocusManager = createAudioFocusManager()
