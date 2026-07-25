"use client"

// The wired live-voice control: negotiation on one side, the button on the
// other, and the thread binding and audio focus in between.
//
// Three rules live here and nowhere else. A call is explicit — it starts on
// this click and ends on the next one, and there is no listening mode to
// leave. A call belongs to the thread it started on: it takes the same
// binding dictation takes, so the shell's "Stop voice" really ends it rather
// than relabelling a call that is still running. And a call never talks over
// dictation: it registers its playback with the shared audio-focus manager,
// so claiming the microphone for dictation pauses the agent's voice, and it
// refuses to start while a capture is already live.
//
// Every browser primitive is injectable, so this component's tests run the
// real negotiation path without getUserMedia or RTCPeerConnection.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { LiveVoiceControl } from "@/components/agent/live-voice-control"
import { voiceAudioFocus, type AudioFocusManager } from "@/lib/audio-focus"
import {
  nextLiveVoiceState,
  type LiveVoiceState,
} from "@/lib/voice-live-state"
import {
  browserAudioSink,
  browserMicrophone,
  browserPeerConnection,
  endRealtimeVoiceFromBrowser,
  exchangeRealtimeOfferFromBrowser,
  startRealtimeVoiceSession,
  type RealtimeVoicePrimitives,
  type RealtimeVoiceSession,
} from "@/lib/voice-realtime"
import {
  voiceSessionStore,
  type VoiceBoundThread,
  type VoiceSessionStore,
} from "@/lib/voice-session-binding"

const DICTATION_ACTIVE =
  "Finish dictation before starting a live voice call."

export interface LiveVoiceComposerControlProps {
  /** The thread this call belongs to. Omitted on composers with no thread of
   *  their own — the call still works, it just has no binding to announce. */
  readonly thread?: VoiceBoundThread
  readonly disabled?: boolean
  readonly store?: VoiceSessionStore
  readonly audioFocus?: AudioFocusManager
  /** Test seam: overrides for the browser media primitives. */
  readonly primitives?: Partial<RealtimeVoicePrimitives>
}

export function LiveVoiceComposerControl({
  thread,
  disabled,
  store = voiceSessionStore,
  audioFocus = voiceAudioFocus,
  primitives,
}: LiveVoiceComposerControlProps) {
  const [state, setState] = useState<LiveVoiceState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const sessionRef = useRef<RealtimeVoiceSession | undefined>(undefined)
  const abortRef = useRef<AbortController | undefined>(undefined)
  // Bumped by every stop so a negotiation that settles after the user hung up
  // is recognised and discarded instead of coming up live behind them.
  const runRef = useRef(0)
  // The thread this call took the binding FOR. Release compares against this,
  // never the current prop: re-pointing the composer mid-call must not hand
  // away a binding the real thread still holds.
  const ownedThreadRef = useRef<string | undefined>(undefined)
  const stopRef = useRef<() => void>(() => {})
  const overrides = useRef(primitives)
  overrides.current = primitives

  const release = useCallback(() => {
    runRef.current += 1
    abortRef.current?.abort()
    abortRef.current = undefined
    // The session's own stop closes the peer connection, stops the microphone
    // tracks, releases playback, and tells the host to end the call.
    sessionRef.current?.stop()
    sessionRef.current = undefined
    audioFocus.registerPlayback(undefined)
    audioFocus.notifyPlaybackStopped()
    const owned = ownedThreadRef.current
    ownedThreadRef.current = undefined
    if (owned) store.releaseOwned(owned)
  }, [audioFocus, store])

  // Media integration, not data: an abandoned call keeps the microphone
  // indicator lit and a codex process alive, so unmount must end it.
  useEffect(() => () => release(), [release])

  const stop = useCallback(() => {
    release()
    setErrorMessage(undefined)
    setState((current) => nextLiveVoiceState(current, "stop"))
  }, [release])

  stopRef.current = stop

  const fail = useCallback(
    (message: string) => {
      release()
      setErrorMessage(message)
      setState((current) => nextLiveVoiceState(current, "fail"))
    },
    [release],
  )

  const defaults = useMemo<RealtimeVoicePrimitives>(
    () => ({
      getMicrophone: browserMicrophone,
      createPeerConnection: browserPeerConnection,
      createAudioSink: browserAudioSink,
      exchange: exchangeRealtimeOfferFromBrowser,
      endSession: endRealtimeVoiceFromBrowser,
    }),
    [],
  )

  const start = useCallback(() => {
    if (state === "connecting" || state === "live") return
    if (audioFocus.isCapturing()) {
      // Dictation holds the microphone. Opening a duplex call on top of it
      // would put two features on one device with no way to tell which one
      // the next utterance belongs to.
      setErrorMessage(DICTATION_ACTIVE)
      setState((current) => nextLiveVoiceState(current, "fail"))
      return
    }
    if (thread) {
      const decision = store.requestBinding(thread, {
        stop: () => stopRef.current(),
      })
      if (decision === "needs-confirmation") {
        // Voice is live on another thread. The click parks a request — it does
        // not steal the binding and does not open a call here. The shell
        // readout now carries the choice.
        return
      }
      // Only claim ownership of a binding this call actually created; an
      // already-bound thread belongs to whoever bound it.
      if (decision === "bind") ownedThreadRef.current = thread.threadId
    }

    setErrorMessage(undefined)
    setState((current) => nextLiveVoiceState(current, "start"))
    const run = ++runRef.current
    const controller = new AbortController()
    abortRef.current = controller

    void startRealtimeVoiceSession({
      ...defaults,
      ...overrides.current,
      signal: controller.signal,
      onRemoteAudio: (sink) => {
        // Registering playback is what lets dictation pause the agent's voice
        // rather than record it back through the microphone.
        audioFocus.registerPlayback({ pause: () => sink.stop() })
        audioFocus.notifyPlaybackStarted()
      },
    })
      .then((session) => {
        if (run !== runRef.current) {
          session.stop()
          return
        }
        sessionRef.current = session
        setState((current) => nextLiveVoiceState(current, "connected"))
      })
      .catch((error: unknown) => {
        if (run !== runRef.current) return
        fail(error instanceof Error ? error.message : "Live voice failed.")
      })
  }, [audioFocus, defaults, fail, state, store, thread])

  return (
    <LiveVoiceControl
      disabled={disabled}
      errorMessage={errorMessage}
      onStart={start}
      onStop={stop}
      state={state}
    />
  )
}
