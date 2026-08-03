"use client"

// The voice-conversation toggle: the switch that turns dictation + the chat
// transcript into a spoken conversation with the real Eve agent.
//
// It is a MODE, not an action, which is why it is a toggle rather than a
// press-and-hold: turning it on changes what the next dictation does (it
// sends instead of drafting) and what a finished reply does (it is spoken).
// Both halves are reversible with the same single click that started them.
//
// It refuses to open while a live call is up. That is not politeness — the
// live call is a separate, capability-limited voice agent on the same speakers
// and the same microphone, and having both would mean two agents answering one
// question with no way to tell which one spoke. The shared audio-focus manager
// arbitrates, so the refusal holds no matter which control is clicked first.

import { useCallback, useEffect, useRef, useState } from "react"
import { SpeechIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import {
  voiceAudioFocus,
  voiceConversationMode,
  voiceConversationPresentation,
  type AudioFocusManager,
  type VoiceConversationPresentation,
} from "@zigil/agent/voice"

/** Plain wording, and it names the thing to end — a user who sees this has a
 *  call running and needs to know that is what is in the way. */
const LIVE_CALL_ACTIVE = "End the live voice call first."

// The same two tones the mic and live-call controls use, mapped to the same
// tokens: on the one row where all three sit, one palette means one thing.
const TONE: Record<VoiceConversationPresentation["tone"], string> = {
  muted: "text-muted-foreground hover:bg-primary/10 hover:text-primary",
  primary: "bg-primary/10 text-primary hover:bg-primary/15",
}

export interface VoiceConversationControlProps {
  readonly active: boolean
  readonly onChange: (active: boolean) => void
  readonly disabled?: boolean
  readonly audioFocus?: AudioFocusManager
  readonly className?: string
}

export function VoiceConversationControl({
  active,
  onChange,
  disabled,
  audioFocus = voiceAudioFocus,
  className,
}: VoiceConversationControlProps) {
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const presentation = voiceConversationPresentation(
    voiceConversationMode(active),
  )
  const focusRef = useRef(audioFocus)
  focusRef.current = audioFocus

  // Leaving the composer must give the mode back, or a live call could never
  // start again. Release is owner-checked, so this cannot free a mode the
  // live call holds.
  useEffect(() => () => focusRef.current.releaseMode("voice-conversation"), [])

  const handleClick = useCallback(() => {
    if (active) {
      audioFocus.releaseMode("voice-conversation")
      setErrorMessage(undefined)
      onChange(false)
      return
    }
    if (!audioFocus.claimMode("voice-conversation")) {
      setErrorMessage(LIVE_CALL_ACTIVE)
      return
    }
    setErrorMessage(undefined)
    onChange(true)
  }, [active, audioFocus, onChange])

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {errorMessage ? (
        <span
          className="max-w-24 truncate text-[11px] text-muted-foreground sm:max-w-40"
          title={errorMessage}
        >
          {errorMessage}
        </span>
      ) : null}
      <button
        aria-label={presentation.label}
        aria-pressed={active}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors",
          TONE[presentation.tone],
          "disabled:cursor-default disabled:opacity-30",
          className,
        )}
        data-voice-conversation={presentation.mode}
        disabled={disabled}
        onClick={handleClick}
        title={presentation.label}
        type="button"
      >
        <SpeechIcon className="size-3.5" />
        {presentation.readout ? (
          <span className="text-[11px] leading-none">
            {presentation.readout}
          </span>
        ) : null}
      </button>
    </span>
  )
}
