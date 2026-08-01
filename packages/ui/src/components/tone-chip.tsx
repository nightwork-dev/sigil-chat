"use client"

// ToneChip — a small pill-shaped CONTROL carrying a semantic tone.
//
// The interactive sibling of Badge, which is a read-only pill and stays that
// way (stock shadcn). This one is a control: it toggles a setting, opens a
// select, or navigates, and its tone says why it is lit. Dense control rows —
// the chips seated under a chat composer, a filter strip, a toolbar's setting
// row — are where it earns its place.
//
// Tone comes from lib/tone, so a chip is legible in every theme and a caller
// never hand-picks a palette step. Each canonical tone means one thing, and a
// call site that lights two chips the same color is saying they mean the same
// thing.
//
// One component, not a family: the host element is the `render` prop, so a
// chip that opens a Select is `render={<SelectTrigger />}` and a chip that
// toggles is the default <button>. PillBar remains the component for a
// single-select GROUP; a ToneChip is one independent control.

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"
import {
  normalizeTone,
  toneBgVariants,
  toneBorderVariants,
  toneTextVariants,
  type ToneLike,
} from "@workspace/ui/lib/tone"

const toneChipVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border whitespace-nowrap",
    "transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&>svg]:size-3 [&>svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      size: {
        // Narrow viewports are where a chip row is thumbed rather than
        // clicked, so the chip grows to a real tap target there instead of
        // staying a 24px pill nobody can hit.
        sm: "h-6 px-2 text-[0.6875rem] max-sm:h-11",
        default: "h-7 px-2.5 text-xs max-sm:h-11",
      },
    },
    defaultVariants: { size: "sm" },
  },
)

/**
 * The chip's classes, for a call site that must render its own element and
 * cannot route through `render` (a third-party trigger that only takes a
 * className, for instance).
 */
export function toneChipClassName({
  tone = "muted",
  size,
  className,
}: {
  tone?: ToneLike
  size?: VariantProps<typeof toneChipVariants>["size"]
  className?: string
} = {}) {
  const resolved = normalizeTone(tone)
  return cn(
    toneChipVariants({ size }),
    toneBgVariants({ tone: resolved }),
    toneBorderVariants({ tone: resolved }),
    toneTextVariants({ tone: resolved }),
    className,
  )
}

export type ToneChipProps = useRender.ComponentProps<"button"> &
  VariantProps<typeof toneChipVariants> & {
    /** Canonical tone (success/warning/destructive/info/muted/primary) or a common alias (active/danger/…). */
    tone?: ToneLike
  }

function ToneChip({
  className,
  size,
  tone = "muted",
  render,
  ...props
}: ToneChipProps) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: toneChipClassName({ tone, size, className }),
        type: "button",
      },
      props,
    ),
    render,
    state: { slot: "tone-chip", tone: normalizeTone(tone) },
  })
}

export { ToneChip, toneChipVariants }
