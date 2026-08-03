"use client"

// The live-voice button: one control, four states, sitting beside dictation
// rather than inside it.
//
// It is built to be told apart from the mic at a glance and by a screen
// reader: a different glyph (waveform, not microphone), a label that always
// says "voice call", and its own `data-live-voice-state` attribute. Same
// discipline as the mic control otherwise — what it shows IS what it does,
// stopping is the same key it started with, and every state's look comes from
// `liveVoicePresentation` so a test and the render enumerate one list.

import {
  AudioLinesIcon,
  Loader2Icon,
  PhoneOffIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import {
  liveVoicePresentation,
  type LiveVoicePresentation,
  type LiveVoiceState,
} from "@zigil/agent/voice"

const ICONS: Record<LiveVoicePresentation["icon"], LucideIcon> = {
  waveform: AudioLinesIcon,
  spinner: Loader2Icon,
  "hang-up": PhoneOffIcon,
}

// The same three tones the mic control uses, mapped to the same tokens: on the
// one row where both controls sit, one palette has to mean one thing.
const TONE: Record<LiveVoicePresentation["tone"], string> = {
  muted: "text-muted-foreground hover:bg-primary/10 hover:text-primary",
  primary: "bg-primary/10 text-primary hover:bg-primary/15",
  destructive: "text-destructive hover:bg-destructive/10",
}

const MOTION: Record<LiveVoicePresentation["motion"], string> = {
  none: "",
  pulse: "animate-pulse",
  spin: "animate-spin",
}

export interface LiveVoiceControlProps {
  readonly state: LiveVoiceState
  /** Shown beside the control in the `error` state — the real failure text
   *  from the host (entitlement, missing binary, refused microphone), not a
   *  fixed label, because those are the messages that tell a user what to do. */
  readonly errorMessage?: string
  readonly onStart: () => void
  readonly onStop: () => void
  readonly disabled?: boolean
  readonly className?: string
}

export function LiveVoiceControl({
  state,
  errorMessage,
  onStart,
  onStop,
  disabled,
  className,
}: LiveVoiceControlProps) {
  const presentation = liveVoicePresentation(state)
  const Icon = ICONS[presentation.icon]
  const stops = presentation.action === "stop"

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {state === "error" && errorMessage ? (
        <span
          className="max-w-24 truncate text-[11px] text-destructive sm:max-w-40"
          title={errorMessage}
        >
          {errorMessage}
        </span>
      ) : null}
      <button
        aria-label={presentation.label}
        aria-pressed={stops}
        className={cn(
          // Same size and radius as the mic control: these are siblings in one
          // control row, and a different metric would read as a different rank.
          "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
          TONE[presentation.tone],
          "disabled:cursor-default disabled:opacity-30",
          className,
        )}
        data-live-voice-action={presentation.action}
        data-live-voice-state={state}
        disabled={disabled}
        onClick={stops ? onStop : onStart}
        title={presentation.label}
        type="button"
      >
        <Icon className={cn("size-3.5", MOTION[presentation.motion])} />
      </button>
    </span>
  )
}
