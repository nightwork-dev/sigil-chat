// The composer's chip row: the small pill controls seated under the input
// (tool approval, reasoning level, fast mode).
//
// One shell, three call sites. They had been hand-copied, which is how fast
// mode ended up wearing the same amber as "always allow" — two chips lit the
// same color for unrelated reasons, so the color meant nothing.
//
// Tone is a theme token, never a raw palette step, and each tone means one
// thing:
//   neutral — the control is at its ordinary setting
//   warning — this setting widens what the agent may do without asking
//   info    — this setting is on and changes how a turn runs, at no added risk

import type { ComponentProps, ReactNode } from "react"

import { SelectTrigger } from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

export type ComposerChipTone = "neutral" | "warning" | "info"

const CHIP_SHELL = "h-6 gap-1 rounded-full border px-2 text-[11px] max-sm:h-11"

const CHIP_TONE: Record<ComposerChipTone, string> = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  warning: "border-warning/40 bg-warning/15 text-warning",
  info: "border-info/40 bg-info/15 text-info",
}

/** The shell, for a call site that must render its own element. */
export function composerChipClass(
  tone: ComposerChipTone = "neutral",
  className?: string,
) {
  return cn(CHIP_SHELL, CHIP_TONE[tone], className)
}

/** A chip that opens a Select. */
function Trigger({
  tone = "neutral",
  className,
  ...props
}: Omit<ComponentProps<typeof SelectTrigger>, "className"> & {
  tone?: ComposerChipTone
  className?: string
}) {
  return (
    <SelectTrigger
      className={composerChipClass(tone, className)}
      size="sm"
      {...props}
    />
  )
}

/** A chip that toggles one setting on or off. */
function Toggle({
  tone = "neutral",
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  tone?: ComposerChipTone
  children: ReactNode
}) {
  return (
    <button
      className={composerChipClass(tone, cn("shrink-0", className))}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

export const ComposerChip = { Trigger, Toggle }
