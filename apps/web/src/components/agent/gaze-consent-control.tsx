"use client"

// The gaze-capture consent toggle — sibling to the voice controls in the
// composer row, held to the same restraint.
//
// Gaze is a camera, as intimate as the mic, so this control is explicit
// (nothing captures until it is pressed), visible (its tone and readout report
// the live state), and reversible (the same press turns it off). There is no
// always-watching default. The heavy lifecycle — permission, calibration —
// lives in the shell controller; this button only flips the consent intent and
// reflects the phase the controller reports back.
//
// Every visual choice, one sentence:
//   • One glyph (Eye), on for both states — tone carries on/off, so a second
//     glyph would make one control look like two (the voice controls' rule).
//   • Tones map to the app's existing meanings and no others: primary = live
//     and sensing, muted = resting, destructive = camera blocked.
//   • The readout appears only while the camera is live — a permanent one would
//     be decoration; one that appears only when something real is happening is
//     information.

import { useCallback } from "react"
import { EyeIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import {
  gazeCapturePresentation,
  type GazeCapturePresentation,
} from "@/lib/gaze/gaze-consent-state"
import {
  setGazeCaptureEnabled,
  useGazeCapturePhase,
} from "@/lib/gaze/gaze-capture-store"

// The same two active/resting tones the voice controls use, plus the shared
// destructive token for the blocked state. One palette, one meaning each.
const TONE: Record<GazeCapturePresentation["tone"], string> = {
  muted: "text-muted-foreground hover:bg-primary/10 hover:text-primary",
  primary: "bg-primary/10 text-primary hover:bg-primary/15",
  destructive:
    "text-destructive hover:bg-destructive/10 hover:text-destructive",
}

export interface GazeConsentControlProps {
  readonly disabled?: boolean
  readonly className?: string
}

export function GazeConsentControl({
  disabled,
  className,
}: GazeConsentControlProps) {
  const phase = useGazeCapturePhase()
  const presentation = gazeCapturePresentation(phase)

  const handleClick = useCallback(() => {
    setGazeCaptureEnabled(presentation.action === "enable")
  }, [presentation.action])

  return (
    <button
      aria-label={presentation.label}
      aria-pressed={presentation.live}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors",
        TONE[presentation.tone],
        "disabled:cursor-default disabled:opacity-30",
        className,
      )}
      data-gaze-capture={presentation.phase}
      disabled={disabled}
      onClick={handleClick}
      title={presentation.label}
      type="button"
    >
      <EyeIcon className="size-3.5" />
      {presentation.readout ? (
        <span className="text-[11px] leading-none">{presentation.readout}</span>
      ) : null}
    </button>
  )
}
