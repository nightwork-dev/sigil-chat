"use client"

// Badge adapters — two Badge wrappers that resolve a caller-supplied value
// into a tinted Badge. Co-located in one module (one registry entry) because
// they are the SAME render family and differ only in the resolver:
//   • StatusBadge — resolves a STRING status against a caller map.
//   • RampBadge   — resolves a NUMBER against a caller ramp of tiers.
// The caller always owns the vocabulary/tiers; Sigil owns only the badge
// geometry + the resolve/fallback rule. No domain/authority names live here.
//
// StatusBadge: an unknown status resolves to a neutral muted fallback — never
// an unstyled or crashing badge — so a caller introducing a new status string
// degrades gracefully instead of rendering raw.

import type { ReactNode } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

export interface StatusVariant {
  /** Tailwind classes for this status's tone (color). e.g. "bg-success/15 text-success". */
  className: string
  /** Optional non-color cue (glyph/symbol) so the status is legible without color. */
  glyph?: ReactNode
  /** Optional display label override (defaults to the raw status string). */
  label?: ReactNode
}

export interface ResolveStatusResult {
  /** The matched variant, or null when the status is unknown. */
  variant: StatusVariant | null
  /** The display label to render (variant.label ?? raw status). */
  label: ReactNode
  /** True when the status had no entry in the map (fell back). */
  fallback: boolean
}

/**
 * Resolve a status string against a presentation map.
 *
 * A present entry returns its variant (with its optional label/glyph). An
 * absent entry returns null + flags fallback; the caller renders a neutral
 * badge whose label is the raw status string (so nothing is silently hidden).
 */
export function resolveStatusVariant(
  status: string,
  variants: Record<string, StatusVariant>,
): ResolveStatusResult {
  const variant = variants[status] ?? null
  return {
    variant,
    label: variant?.label ?? status,
    fallback: variant === null,
  }
}

export interface StatusBadgeProps {
  /** The status string to look up. */
  status: string
  /** Caller-defined status→presentation map. No authority-state names baked in. */
  variants: Record<string, StatusVariant>
  className?: string
}

function StatusBadge({ status, variants, className }: StatusBadgeProps) {
  const { variant, label, fallback } = resolveStatusVariant(status, variants)

  // Unknown status → muted neutral fallback. The raw label still shows so a
  // new status is visible (just un-styled) rather than silently blank.
  if (fallback || !variant) {
    return (
      <Badge variant="secondary" className={cn("text-muted-foreground", className)}>
        <span>{label}</span>
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className={cn(variant.className, className)}>
      {variant.glyph ? <span aria-hidden="true">{variant.glyph}</span> : null}
      <span>{label}</span>
    </Badge>
  )
}

export { StatusBadge }

// ── Ramp adapter ───────────────────────────────────────────────────────────
// RampBadge — the numeric-threshold sibling of StatusBadge. Maps a numeric
// value into a caller-supplied ramp (ordered steps, each {max, className,
// glyph}) and renders it as a tinted Badge. Every step carries a REQUIRED
// glyph so the tier is legible without color; the numeric value is always
// rendered too (the primary, color-independent readout).

export interface RampStep {
  /** Upper bound (inclusive) of this step's value range. */
  max: number
  /** Tailwind classes for this step's tone (color). e.g. "bg-warning/15 text-warning". */
  className: string
  /** Non-color cue — REQUIRED so the step is legible without color. */
  glyph: ReactNode
}

export interface ResolveRampResult {
  /** The resolved step, or null when the ramp is empty (caller should fall back). */
  step: RampStep | null
  /** True when value sat above every step's max (clamped to the last step). */
  clamped: boolean
}

/**
 * Resolve which ramp step a value falls into.
 *
 * Steps are matched in order; the first step whose `max` is >= value wins. A
 * value above every step's max clamps to the LAST step (and flags it). An
 * empty ramp returns null so the caller can render a neutral fallback.
 */
export function resolveRampStep(value: number, ramp: readonly RampStep[]): ResolveRampResult {
  if (ramp.length === 0) return { step: null, clamped: false }

  for (const step of ramp) {
    if (value <= step.max) return { step, clamped: false }
  }
  return { step: ramp[ramp.length - 1]!, clamped: true }
}

export interface RampBadgeProps {
  /** The numeric value to display and resolve against the ramp. */
  value: number
  /** Ordered ramp steps (ascending max). Caller-defined; no domain kinds baked in. */
  ramp: RampStep[]
  /** Optional formatter for the displayed value (e.g. units, decimals). */
  format?: (value: number) => ReactNode
  className?: string
}

function RampBadge({ value, ramp, format, className }: RampBadgeProps) {
  const { step } = resolveRampStep(value, ramp)
  const displayed = format ? format(value) : value

  // Empty ramp → neutral fallback. Never throws; never silently mis-tints.
  if (!step) {
    return (
      <Badge variant="secondary" className={className}>
        <span>{displayed}</span>
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className={cn(step.className, className)}>
      {/* glyph first so the shape cue precedes the number in reading order */}
      <span aria-hidden="true">{step.glyph}</span>
      <span>{displayed}</span>
    </Badge>
  )
}

export { RampBadge }
