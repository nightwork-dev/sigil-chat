"use client"

// The wired mic control: `useVoiceDictation` on one side, `VoiceMicControl`
// on the other, and the thread binding in between.
//
// Two rules live here and nowhere else. A transcript becomes a DRAFT in the
// composer — `dictationOutcome` decides that, and this component simply never
// passes an `onSend` unless the caller opted into voice-first, so auto-send is
// unreachable rather than merely unlikely. And starting dictation while a
// capture is live on another thread does not steal the binding: the request
// parks, the shell readout says so, and this composer stays idle.

import { useCallback, useRef } from "react"

import {
  useVoiceDictation,
  voiceSessionStore,
  type AudioFocusManager,
  type VoiceBoundThread,
  type VoiceRecorder,
  type VoiceSessionStore,
} from "@zigil/agent/voice"

import { VoiceMicControl } from "@/components/agent/voice-mic-control"

export interface ComposerVoiceControlProps {
  /** The thread this composer writes into. Omitted on composers with no
   *  thread of their own — dictation still works, it just has no binding to
   *  announce. */
  readonly thread?: VoiceBoundThread
  readonly onDraft: (text: string) => void
  /** Only consulted when `voiceFirst` is explicitly true. */
  readonly onSend?: (text: string) => void
  readonly voiceFirst?: boolean
  readonly disabled?: boolean
  readonly store?: VoiceSessionStore
  /** Test seam: the browser recorder is the default. */
  readonly createRecorder?: () => VoiceRecorder
  readonly transcribe?: (audio: Blob) => Promise<string | undefined>
  /** Defaults to the app's shared manager. Overridden only so a test can put
   *  this control and the speech player on one manager and observe that
   *  claiming the microphone really pauses the agent's voice. */
  readonly audioFocus?: AudioFocusManager
}

export function ComposerVoiceControl({
  thread,
  onDraft,
  onSend,
  voiceFirst,
  disabled,
  store = voiceSessionStore,
  createRecorder,
  transcribe,
  audioFocus,
}: ComposerVoiceControlProps) {
  // The thread this capture took the binding FOR, recorded when it started.
  // Release compares against this, never against the current `thread` prop:
  // the composer can be re-pointed at another thread mid-capture, and giving
  // up the binding for whichever thread happens to be showing then would
  // leave the real one held forever.
  const ownedThreadRef = useRef<string | undefined>(undefined)
  const stopRef = useRef<() => void>(() => {})

  const handleActiveChange = useCallback(
    (active: boolean) => {
      if (active) return
      const owned = ownedThreadRef.current
      ownedThreadRef.current = undefined
      if (owned) store.releaseOwned(owned)
    },
    [store],
  )

  const dictation = useVoiceDictation({
    audioFocus,
    createRecorder,
    onActiveChange: handleActiveChange,
    onDraft,
    onSend: voiceFirst === true ? onSend : undefined,
    transcribe,
    voiceFirst,
  })

  stopRef.current = dictation.stop

  const handleStart = useCallback(() => {
    if (thread) {
      // The handle is how the shell readout ends this capture from another
      // route — it goes through this component's own stop, so the microphone
      // is really released rather than merely re-labelled.
      const decision = store.requestBinding(thread, {
        stop: () => stopRef.current(),
      })
      if (decision === "needs-confirmation") {
        // A capture is live on another thread. The click parks a request — it
        // does NOT steal the binding, and it does not start capture here. The
        // shell readout now carries the choice, which is why this control
        // stays enabled: a disabled button would leave no way to ask.
        return
      }
      ownedThreadRef.current = thread.threadId
    }
    dictation.start()
  }, [dictation, store, thread])

  return (
    <VoiceMicControl
      disabled={disabled}
      errorMessage={dictation.errorMessage}
      onStart={handleStart}
      onStop={dictation.stop}
      state={dictation.state}
    />
  )
}
