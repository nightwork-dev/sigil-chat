// Surface pattern treatments — the shared vocabulary of textured CSS fills and
// edge masks, so a "hatched / dotted / feathered surface" is ONE reusable
// treatment instead of ad-hoc repeating-gradients hand-rolled per component.
//
// Pure builders returning CSS values (or a small style fragment); apply via
//   style={{ backgroundImage: hatch() }}          // a fill string
//   style={dotGrid()}                              // {backgroundImage, backgroundSize}
//   style={{ maskImage: softEdgeMask(a, b) }}      // an edge feather
// Fills are currentColor-driven by default, so they inherit the element's ink
// (set `color`/text color to tint) and stay token-reactive across themes.

import type { CSSProperties } from "react"

export interface HatchOptions {
  /** Line angle in degrees (default 135 — top-left → bottom-right). */
  angle?: number
  /** Width of each hatch line in px (default 2). */
  thickness?: number
  /** Pattern period in px — line + gap (default 6, i.e. a 2px line every 6px). */
  spacing?: number
  /** Explicit line color; overrides `opacity`. Use for a fixed token, e.g. "var(--color-primary)". */
  color?: string
  /** currentColor mix percent when no explicit `color` (default 24). */
  opacity?: number
}

/**
 * Diagonal hatch fill — evenly spaced parallel lines. The canonical treatment
 * for an INDETERMINATE / order-only / uncertain span (call with no args for
 * that shared look), and a general textured stripe otherwise.
 *
 * Returns a `background-image` value.
 */
export function hatch(options: HatchOptions = {}): string {
  const { angle = 135, thickness = 2, spacing = 6, color, opacity = 24 } = options
  const fill = color ?? `color-mix(in oklab, currentColor ${opacity}%, transparent)`
  const gap = Math.max(0, spacing - thickness)
  return `repeating-linear-gradient(${angle}deg, transparent 0 ${gap}px, ${fill} ${gap}px ${spacing}px)`
}

export interface DotGridOptions {
  /** Dot radius in px (default 1). */
  radius?: number
  /** Grid spacing in px, both axes (default 20). */
  spacing?: number
  /** Dot color (default "var(--color-border)"). */
  color?: string
}

/**
 * A tiled dot grid — one dot repeated on a square lattice. Returns the
 * `backgroundImage` + `backgroundSize` pair (spread into a style object); set
 * `opacity` on the element itself to soften it.
 */
export function dotGrid(
  options: DotGridOptions = {},
): Pick<CSSProperties, "backgroundImage" | "backgroundSize"> {
  const { radius = 1, spacing = 20, color = "var(--color-border)" } = options
  return {
    backgroundImage: `radial-gradient(circle, ${color} ${radius}px, transparent ${radius}px)`,
    backgroundSize: `${spacing}px ${spacing}px`,
  }
}

/** Default feather width (px) for a soft (blurred / uncertain) span boundary. */
export const SOFT_EDGE_PX = 10

/**
 * A CSS `mask-image` that feathers the leading and/or trailing edge of a span,
 * so a soft (uncertain) boundary fades out instead of ending on a hard line.
 * Returns `undefined` when neither edge is soft (no mask needed).
 *
 * @param px feather width in px (default {@link SOFT_EDGE_PX})
 */
export function softEdgeMask(
  softStart?: boolean,
  softEnd?: boolean,
  px: number = SOFT_EDGE_PX,
): string | undefined {
  if (!softStart && !softEnd) return undefined
  if (softStart && softEnd) {
    return `linear-gradient(to right, transparent, #000 ${px}px, #000 calc(100% - ${px}px), transparent)`
  }
  if (softStart) return `linear-gradient(to right, transparent, #000 ${px}px)`
  return `linear-gradient(to right, #000 calc(100% - ${px}px), transparent)`
}
