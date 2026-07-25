"use client"

// The composer's trailing mic control — the whole of dictation's UI surface.
//
// One button, five states, because the alternative (a start button plus a
// separate stop button plus a status pip) would spend three affordances
// saying one thing. What the control shows IS what it does: resting it offers
// to start, live it offers to stop, and the way out is the same key it came
// in by. There is no always-listening mode to leave — capture begins only on
// this click and ends on the next one.
//
// Every state's look comes from `voiceControlPresentation`, so the states a
// test enumerates and the states this renders are the same list.

import {
  Loader2Icon,
  MicIcon,
  MicOffIcon,
  SquareIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import {
  voiceControlPresentation,
  type VoiceControlPresentation,
  type VoiceControlState,
} from "@/lib/voice-control-state"

const ICONS: Record<VoiceControlPresentation["icon"], LucideIcon> = {
  mic: MicIcon,
  stop: SquareIcon,
  spinner: Loader2Icon,
  "mic-off": MicOffIcon,
}

// Tone means what it means everywhere else: `primary` is the active/on state
// (the mic is live), `destructive` is failure, muted is resting. No third
// palette, no colour that means two things.
const TONE: Record<VoiceControlPresentation["tone"], string> = {
  muted: "text-muted-foreground hover:bg-primary/10 hover:text-primary",
  primary: "bg-primary/10 text-primary hover:bg-primary/15",
  destructive: "text-destructive hover:bg-destructive/10",
}

// Motion is reserved for an unfinished process: a permission prompt the user
// hasn't answered, a transcript still in flight. A live mic gets no animation
// — its state is already carried by the icon and the tone.
const MOTION: Record<VoiceControlPresentation["motion"], string> = {
  none: "",
  pulse: "animate-pulse",
  spin: "animate-spin",
}

export interface VoiceMicControlProps {
  readonly state: VoiceControlState
  /** Shown beside the control in the `error` state — real failure text, not
   *  a fixed label. */
  readonly errorMessage?: string
  readonly onStart: () => void
  readonly onStop: () => void
  readonly disabled?: boolean
  readonly className?: string
}

export function VoiceMicControl({
  state,
  errorMessage,
  onStart,
  onStop,
  disabled,
  className,
}: VoiceMicControlProps) {
  const presentation = voiceControlPresentation(state)
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
          "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
          TONE[presentation.tone],
          "disabled:cursor-default disabled:opacity-30",
          className,
        )}
        data-voice-action={presentation.action}
        data-voice-state={state}
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
