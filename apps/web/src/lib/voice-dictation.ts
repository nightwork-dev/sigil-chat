// One dictation, start to finish — permission, capture, transcription, and
// what the result is allowed to do.
//
// The pieces this composes already exist and are tested on their own:
// `transcribeAudio` (never throws), `dictationOutcome` (draft unless the
// caller explicitly opted into voice-first), `createAudioFocusManager` (STT
// and TTS never talk over each other), `createCaptureLifecycle` (hardware is
// released on every exit path). This hook is the ordering between them plus
// the state the control renders, and nothing else.
//
// The recorder is injected. The default implementation touches getUserMedia
// and MediaRecorder; every test passes a fake, so the whole flow — including
// the failure paths — is exercised without a browser.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { transcribeAudio } from "./agent-transcribe"
import { voiceAudioFocus, type AudioFocusManager } from "./audio-focus"
import { createCaptureLifecycle } from "./capture-lifecycle"
import { dictationOutcome } from "./dictation-outcome"
import {
  nextVoiceControlState,
  type VoiceControlState,
} from "./voice-control-state"

export interface VoiceRecorder {
  /** Resolve once the microphone is actually live. Rejects if it isn't. */
  readonly start: () => Promise<void>
  /** End the utterance and hand back what was captured. */
  readonly stop: () => Promise<Blob | undefined>
  /** Abandon the capture and release the hardware. Always safe to call. */
  readonly cancel: () => void
}

export interface UseVoiceDictationOptions {
  /** Where a finished transcript goes by default: the composer, editable. */
  readonly onDraft: (text: string) => void
  /** Only reachable with `voiceFirst`. Never called otherwise. */
  readonly onSend?: (text: string) => void
  /** Explicit, per-session opt-in to auto-send. Absent means draft. */
  readonly voiceFirst?: boolean
  readonly createRecorder?: () => VoiceRecorder
  readonly transcribe?: (audio: Blob) => Promise<string | undefined>
  readonly audioFocus?: AudioFocusManager
  /** Fired at the two moments the hook owns: capture became active, capture
   *  settled (cleanly, cancelled, or failed). The caller uses it to hold and
   *  release the thread binding — an event, not state to mirror. */
  readonly onActiveChange?: (active: boolean) => void
}

export interface VoiceDictation {
  readonly state: VoiceControlState
  /** Present only in the `error` state; what to tell the user. */
  readonly errorMessage?: string
  readonly start: () => void
  /** Ends capture from any active state — finishing an utterance while
   *  listening, backing out while waiting or transcribing. */
  readonly stop: () => void
}

const TRANSCRIBE_FAILED = "Could not transcribe that — type it instead."
const MICROPHONE_FAILED = "Microphone unavailable — check browser permission."

/** Join a transcript onto whatever is already in the composer. Dictation adds
 *  to a draft; it never replaces what the user typed. */
export function appendDictationDraft(current: string, text: string): string {
  if (!current) return text
  return /\s$/.test(current) ? `${current}${text}` : `${current} ${text}`
}

export function useVoiceDictation({
  onDraft,
  onSend,
  voiceFirst,
  createRecorder = createBrowserVoiceRecorder,
  transcribe = transcribeAudio,
  audioFocus,
  onActiveChange,
}: UseVoiceDictationOptions): VoiceDictation {
  const [state, setState] = useState<VoiceControlState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const recorderRef = useRef<VoiceRecorder | undefined>(undefined)
  // Bumped by every stop/cancel so a late async result from an abandoned
  // capture can be recognised and dropped instead of landing in the composer.
  const runRef = useRef(0)
  // The shared manager by default: dictation and a live duplex call are on
  // separate controls but one physical channel, and a per-hook manager would
  // coordinate this component with only itself.
  const focus = useMemo(() => audioFocus ?? voiceAudioFocus, [audioFocus])
  const activeRef = useRef(false)
  const activeChangeRef = useRef(onActiveChange)
  activeChangeRef.current = onActiveChange

  /** Announce a capture-active edge exactly once per edge. */
  const setActive = useCallback((active: boolean) => {
    if (activeRef.current === active) return
    activeRef.current = active
    activeChangeRef.current?.(active)
  }, [])

  const release = useCallback(() => {
    runRef.current += 1
    recorderRef.current?.cancel()
    recorderRef.current = undefined
    focus.stopCapture()
    setActive(false)
  }, [focus, setActive])

  // Media integration, not data: an abandoned capture keeps the microphone
  // indicator lit, so unmount must release it.
  useEffect(() => () => release(), [release])

  const start = useCallback(() => {
    // A capture already holds the device. The control never offers start in
    // that case, but a second caller (a shortcut, a stray double-fire) must
    // not open a second one behind the first.
    if (activeRef.current) return
    setErrorMessage(undefined)
    setState((current) => nextVoiceControlState(current, "start"))
    const run = ++runRef.current
    focus.startCapture()
    setActive(true)
    const recorder = createRecorder()
    recorderRef.current = recorder
    void recorder
      .start()
      .then(() => {
        if (run !== runRef.current) {
          recorder.cancel()
          return
        }
        setState((current) =>
          nextVoiceControlState(current, "microphone-granted"),
        )
      })
      .catch(() => {
        recorder.cancel()
        if (run !== runRef.current) return
        recorderRef.current = undefined
        focus.stopCapture()
        setActive(false)
        setErrorMessage(MICROPHONE_FAILED)
        setState((current) => nextVoiceControlState(current, "fail"))
      })
  }, [createRecorder, focus, setActive])

  const finishListening = useCallback(() => {
    const recorder = recorderRef.current
    const run = runRef.current
    setState((current) => nextVoiceControlState(current, "capture-ended"))
    void (async () => {
      const audio = await recorder?.stop().catch(() => undefined)
      if (run !== runRef.current) return
      const text = audio ? await transcribe(audio) : undefined
      if (run !== runRef.current) return
      recorderRef.current = undefined
      focus.stopCapture()
      setActive(false)
      const outcome = dictationOutcome(text, { voiceFirst })
      if (outcome.kind === "send") {
        onSend?.(outcome.text)
      } else if (outcome.kind === "draft") {
        onDraft(outcome.text)
      }
      if (outcome.kind === "noop") {
        setErrorMessage(TRANSCRIBE_FAILED)
        setState((current) => nextVoiceControlState(current, "fail"))
        return
      }
      setState((current) => nextVoiceControlState(current, "transcribed"))
    })()
  }, [focus, onDraft, onSend, setActive, transcribe, voiceFirst])

  const stop = useCallback(() => {
    if (state === "listening") {
      finishListening()
      return
    }
    release()
    setErrorMessage(undefined)
    setState((current) => nextVoiceControlState(current, "cancel"))
  }, [finishListening, release, state])

  return { state, errorMessage, start, stop }
}

/**
 * The real recorder: microphone tracks plus a MediaRecorder, with release
 * routed through `createCaptureLifecycle` so stop, error, and unmount all free
 * the same hardware. Only reachable in a browser — tests inject a fake.
 */
export function createBrowserVoiceRecorder(): VoiceRecorder {
  let lifecycle: { stop: () => void } | undefined
  let recorder: MediaRecorder | undefined
  const chunks: Blob[] = []

  return {
    async start() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      lifecycle = createCaptureLifecycle({ tracks: stream.getTracks() })
      recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.start()
    },
    stop() {
      const active = recorder
      if (!active) {
        lifecycle?.stop()
        return Promise.resolve(undefined)
      }
      return new Promise<Blob | undefined>((resolve) => {
        active.onstop = () => {
          lifecycle?.stop()
          resolve(
            chunks.length > 0
              ? new Blob(chunks, { type: active.mimeType || "audio/webm" })
              : undefined,
          )
        }
        active.stop()
      })
    },
    cancel() {
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null
        recorder.stop()
      }
      recorder = undefined
      lifecycle?.stop()
    },
  }
}
