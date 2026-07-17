import { cva } from "class-variance-authority"

/*
 * Semantic tone — the shared status-color vocabulary for custom components.
 *
 * Canonical tones use the names LLMs and shadcn-trained code expect:
 * `success` / `warning` / `destructive` / `info` / `muted`, plus `primary`
 * (the theme signal) for emphasis that isn't a health state. Each maps to a
 * theme token (--color-success etc.), so every tone stays inside the active
 * thermal envelope — never raw Tailwind palette classes (bg-emerald-400)
 * for semantic state.
 *
 * This is generic health/severity language. Constraint provenance
 * (pinned/derived/conflicting/…) is a different language and lives in
 * `value-status.ts` — don't merge them.
 *
 * Components keep their own local vocabularies as aliases (e.g. StatusDot's
 * `active` → success, `danger` → destructive) mapped in their own CVA maps.
 */

export type Tone =
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "muted"

/*
 * Common alternate spellings, accepted everywhere a tone is accepted so
 * LLM-generated call sites (`status="danger"`, `status="active"`) resolve
 * to the canonical tone instead of failing.
 */
const TONE_ALIASES = {
  active: "success",
  positive: "success",
  ok: "success",
  danger: "destructive",
  error: "destructive",
  warn: "warning",
  inactive: "muted",
  neutral: "muted",
} as const satisfies Record<string, Tone>

export type ToneAlias = keyof typeof TONE_ALIASES
export type ToneLike = Tone | ToneAlias

export function normalizeTone(tone: ToneLike): Tone {
  return tone in TONE_ALIASES ? TONE_ALIASES[tone as ToneAlias] : (tone as Tone)
}

/** Solid dot/indicator fill (StatusDot, LED-style markers). */
export const toneDotVariants = cva("", {
  variants: {
    tone: {
      primary: "bg-primary",
      success: "bg-success",
      warning: "bg-warning",
      destructive: "bg-destructive",
      info: "bg-info",
      muted: "bg-muted-foreground/30",
    },
  },
  defaultVariants: { tone: "muted" },
})

/** Translucent ping/halo behind a dot (StatusDot's `pulse="ping"` ring). */
export const tonePingVariants = cva("", {
  variants: {
    tone: {
      primary: "bg-primary/40",
      success: "bg-success/40",
      warning: "bg-warning/40",
      destructive: "bg-destructive/40",
      info: "bg-info/40",
      muted: "bg-muted-foreground/20",
    },
  },
  defaultVariants: { tone: "muted" },
})

/** Text color (labels, severity prefixes, readouts). */
export const toneTextVariants = cva("", {
  variants: {
    tone: {
      primary: "text-primary",
      success: "text-success",
      warning: "text-warning",
      destructive: "text-destructive",
      info: "text-info",
      muted: "text-muted-foreground",
    },
  },
  defaultVariants: { tone: "muted" },
})

/** Solid fill for bars/segments (Meter fills, progress segments). */
export const toneFillVariants = cva("", {
  variants: {
    tone: {
      primary: "bg-primary",
      success: "bg-success",
      warning: "bg-warning",
      destructive: "bg-destructive",
      info: "bg-info",
      muted: "bg-muted-foreground/40",
    },
  },
  defaultVariants: { tone: "primary" },
})

/** Soft tinted background (badges, callouts, row highlights). */
export const toneBgVariants = cva("", {
  variants: {
    tone: {
      primary: "bg-primary/12",
      success: "bg-success/12",
      warning: "bg-warning/12",
      destructive: "bg-destructive/12",
      info: "bg-info/12",
      muted: "bg-muted",
    },
  },
  defaultVariants: { tone: "muted" },
})

/** Border color (callouts, focus states, severity outlines). */
export const toneBorderVariants = cva("", {
  variants: {
    tone: {
      primary: "border-primary/40",
      success: "border-success/40",
      warning: "border-warning/40",
      destructive: "border-destructive/40",
      info: "border-info/40",
      muted: "border-border",
    },
  },
  defaultVariants: { tone: "muted" },
})
