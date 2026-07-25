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
}

export function createAudioFocusManager(): AudioFocusManager {
  let playback: PlaybackHandle | undefined
  let capturing = false
  let playing = false

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
  }
}
