// Pure layout math behind <EraBand>. The component is a thin render layer;
// the contract callers + a11y + tests rely on — clamping, the
// proportional-vs-sequence width model, cursor percentage — lives here so it
// can be locked independently of the DOM. Matches the repo's extract-the-math
// convention (see lib/minimap.ts, lib/spotlight-focus.ts).
//
// DESIGN MODEL (the partial-order ruling "sequence is the backbone; proportion
// is a privilege," made geometric):
//   The band is a CONTIGUOUS sequence laid out left-to-right in caller/array
//   order (the backbone). Each era's WIDTH comes from its span magnitude when
//   it has a valid measured span (proportion = the privilege), or an equal
//   share when it does not (sequence). Widths are normalized so the band fills
//   [0,1] with no gaps — the cursor (0..1) is interpreted against THIS rendered
//   axis. An era with a null or degenerate span renders in sequence mode
//   (order-only, the honest "we know the order, not the duration" treatment),
//   never as zero width and never coerced into a fake-precise position.

/** One era in the band. `span` is normalized 0..1 on the caller's axis; null = order-only. */
export interface EraBandEra {
  id: string
  label: string
  subtitle?: string
  /**
   * Caller-supplied className token (e.g. a theme-token class). The band
   * never invents colors — with no tone, segments alternate two neutral
   * surface steps. This is a display shape only; it carries no domain meaning.
   */
  tone?: string
  /** Measured span on the caller's 0..1 axis. null = order-only (sequence). */
  span?: { start: number; end: number } | null
  /** Feather the leading/trailing edge (soft boundary) instead of a hard seam. */
  softStart?: boolean
  softEnd?: boolean
}

/** A resolved era after layout: where it sits and how it was sized. */
export interface ResolvedEra {
  id: string
  /** Left edge on the rendered [0,1] axis (inclusive). */
  start: number
  /** Right edge on the rendered [0,1] axis (exclusive). */
  end: number
  /** How this era was sized — drives the edge treatment (solid vs hatch). */
  mode: "proportional" | "sequence"
}

export const ERA_AXIS_MIN = 0
export const ERA_AXIS_MAX = 1

/** Clamp a value into the [0, 1] axis range. NaN maps to the floor (0). */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return ERA_AXIS_MIN
  return Math.max(ERA_AXIS_MIN, Math.min(ERA_AXIS_MAX, value))
}

/**
 * Clamp + order a caller-supplied span into a sane [0,1] window. Returns null
 * for a missing or degenerate span (start >= end) — degenerate spans fall back
 * to sequence mode rather than rendering as a zero-width sliver.
 */
export function normalizeSpan(span: EraBandEra["span"]): { start: number; end: number } | null {
  if (!span) return null
  const start = clamp01(span.start)
  const end = clamp01(span.end)
  if (end - start <= 0) return null
  return { start, end }
}

/** Mean of an array; 0 for an empty array. */
function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Resolve a band of eras into contiguous [0,1] positions. Each era's width is
 * its span magnitude (proportional) or an equal share (sequence); widths
 * normalize to fill [0,1] with no gaps. Returns an empty array for an empty
 * band. The output is in the SAME order as the input (the backbone), with
 * `start`/`end` making them tile contiguously from 0 to 1.
 */
export function resolveEraLayout(eras: readonly EraBandEra[]): ResolvedEra[] {
  if (eras.length === 0) return []

  const weighted = eras.map((era) => {
    const span = normalizeSpan(era.span)
    return span
      ? { id: era.id, mode: "proportional" as const, weight: span.end - span.start }
      : { id: era.id, mode: "sequence" as const, weight: NaN } // filled below
  })

  // Sequence eras share ONE width: the mean of the proportional magnitudes
  // (so they read comparable to measured spans), or 1 each when nothing is
  // measured (so an all-sequence band divides [0,1] into equal segments).
  const proportionalWeights = weighted.filter((w) => w.mode === "proportional").map((w) => w.weight)
  const sequenceUnit = proportionalWeights.length > 0 ? mean(proportionalWeights) : 1
  for (const w of weighted) if (w.mode === "sequence") w.weight = sequenceUnit

  const total = weighted.reduce((sum, w) => sum + w.weight, 0)
  // A total of 0 (all sequence with sequenceUnit 0 — only if mean was 0)
  // degrades to equal shares so the band still renders.
  const safeTotal = total > 0 ? total : eras.length

  const out: ResolvedEra[] = []
  let cursor = ERA_AXIS_MIN
  for (const w of weighted) {
    const width = w.weight / safeTotal
    const start = cursor
    const end = clamp01(cursor + width)
    out.push({ id: w.id, start, end, mode: w.mode })
    cursor = end
  }
  // Pin the final edge to exactly 1 so floating-point drift never leaves a
  // hairline gap (or overshoot) at the right edge of the band.
  if (out.length > 0) out[out.length - 1]!.end = ERA_AXIS_MAX
  return out
}

/**
 * Round a 0..1 cursor to a whole-percent for the accessible announcement
 * ("cursor at 62%"). Clamps out-of-range values; NaN → 0.
 */
export function cursorToPercent(cursor: number): number {
  return Math.round(clamp01(cursor) * 100)
}

/** Keep a selected cursor in view without stealing scroll when it is already visible. */
export function scrollLeftForCursor(
  cursor: number,
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): number {
  if (scrollWidth <= clientWidth) return scrollLeft
  const cursorX = clamp01(cursor) * scrollWidth
  const visibleEnd = scrollLeft + clientWidth
  if (cursorX >= scrollLeft && cursorX <= visibleEnd) return scrollLeft
  return Math.max(0, Math.min(scrollWidth - clientWidth, cursorX - clientWidth / 2))
}

/**
 * Compose an era's accessible label: "label" or "label, subtitle". The
 * caller-supplied subtitle is announced in full so a screen reader gets the
 * same context a sighted user does.
 */
export function describeEra(era: EraBandEra): string {
  return era.subtitle ? `${era.label}, ${era.subtitle}` : era.label
}
