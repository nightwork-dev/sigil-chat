// Playing the agent's voice — one utterance at a time, and never over the mic.
//
// `synthesizeSpeech` hands back a Blob and stops there; something has to own
// the element that plays it, and that owner is the only place two invariants
// can actually hold:
//
//   1. Never two playbacks at once. Starting a new utterance stops the one in
//      flight rather than layering over it. Two voices talking simultaneously
//      is not a degraded experience, it is an unusable one.
//   2. Playback never talks over capture. Play registers with the shared
//      audio-focus manager, so starting dictation pauses it; and a play
//      request that arrives while the microphone is live is refused outright
//      rather than queued behind it.
//
// The element is behind a driver seam, so the whole ordering — including the
// pause-on-capture path — is exercised without an <audio> tag or a real Blob
// URL. Nothing here throws: speech is a delivery surface over an authoritative
// text transcript, so the worst outcome of any failure is silence.

import { voiceAudioFocus, type AudioFocusManager } from "./audio-focus"

export interface SpeechPlaybackDriver {
  /** Begin playback. Resolves when the audio ends, fails, or is stopped —
   *  never rejects. */
  readonly play: () => Promise<void>
  /** End playback now. Safe to call after it already ended. */
  readonly stop: () => void
}

export type SpeechPlaybackDriverFactory = (audio: Blob) => SpeechPlaybackDriver

export interface SpeechPlayer {
  /** Play one utterance, replacing whatever was playing. Resolves when this
   *  utterance is done — awaiting it is how a caller plays a sequence without
   *  overlapping. */
  readonly play: (audio: Blob) => Promise<void>
  readonly stop: () => void
  readonly isPlaying: () => boolean
}

export interface SpeechPlayerOptions {
  readonly audioFocus?: AudioFocusManager
  readonly createDriver?: SpeechPlaybackDriverFactory
}

export function createSpeechPlayer({
  audioFocus = voiceAudioFocus,
  createDriver = browserSpeechDriver,
}: SpeechPlayerOptions = {}): SpeechPlayer {
  let current: SpeechPlaybackDriver | undefined
  // Bumped by every stop and every new utterance, so a driver that settles
  // after it was superseded cannot clear the newer one's registration.
  let run = 0

  function stop(): void {
    run += 1
    const stopping = current
    current = undefined
    stopping?.stop()
    audioFocus.registerPlayback(undefined)
    audioFocus.notifyPlaybackStopped()
  }

  return {
    async play(audio) {
      stop()
      // The microphone owns the channel while it is live. Refusing here (not
      // queueing) keeps the rule simple: what you hear is never something the
      // app decided to save up while you were talking.
      if (audioFocus.isCapturing()) return
      // A live call is a second agent already speaking through these
      // speakers. Its audio is not ours to interrupt or to talk over, so an
      // utterance that arrives during one is dropped, not queued behind it.
      if (audioFocus.modeOwner() === "live-call") return
      const mine = ++run
      const driver = createDriver(audio)
      current = driver
      // This registration is what lets dictation pause the agent mid-sentence
      // instead of recording it back through the microphone.
      audioFocus.registerPlayback({ pause: () => driver.stop() })
      audioFocus.notifyPlaybackStarted()
      await driver.play()
      if (mine !== run) return
      current = undefined
      audioFocus.registerPlayback(undefined)
      audioFocus.notifyPlaybackStopped()
    },
    stop,
    isPlaying: () => current !== undefined,
  }
}

/** The real driver: an object URL behind an Audio element, revoked on every
 *  exit path so a long session does not leak one blob per reply. Only
 *  reachable in a browser — tests inject a fake. */
export function browserSpeechDriver(audio: Blob): SpeechPlaybackDriver {
  const url = URL.createObjectURL(audio)
  const element = new Audio(url)
  let settle: (() => void) | undefined
  let done = false

  function finish(): void {
    if (done) return
    done = true
    URL.revokeObjectURL(url)
    settle?.()
  }

  return {
    play: () =>
      new Promise<void>((resolve) => {
        settle = resolve
        if (done) {
          resolve()
          return
        }
        element.onended = finish
        element.onerror = finish
        element.play().catch(finish)
      }),
    stop: () => {
      element.pause()
      finish()
    },
  }
}

/** The app's one speech player. The per-message "read aloud" button and the
 *  spoken-replies loop are separate features, but a user hears one pair of
 *  speakers — so they share one player, or "one utterance at a time" is a
 *  promise each makes only to itself. */
export const agentSpeechPlayer: SpeechPlayer = createSpeechPlayer()
