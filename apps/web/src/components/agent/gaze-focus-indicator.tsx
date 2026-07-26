"use client"

// The "what you're looking at" cue (VOX.7): a soft outline tracing the region
// under the LIVE gaze, so the user can see exactly what the agent sees.
//
// It reads the live region's viewport rect from the capture store (the
// controller publishes it every frame) and draws one fixed, pointer-transparent
// box there. Treatment (ux-design-language): a soft primary-tinted ring — the
// app's single "active presence" tone, the same one the meet-gaze portrait ring
// and the capture pill use — with no fill and no shadow, so it reads as "this is
// what the agent sees" without competing with the content it frames; the ring
// gliding between targets encodes the gaze moving, so the motion is information.

import { cn } from "@workspace/ui/lib/utils"

import { useGazeIndicatorRect } from "@/lib/gaze/gaze-capture-store"

export function GazeFocusIndicator() {
  const rect = useGazeIndicatorRect()
  if (!rect) return null

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed z-40 rounded-lg ring-2 ring-primary/50",
        "transition-all duration-150 ease-out",
      )}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    />
  )
}
