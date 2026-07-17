// Shared rotary geometry — Layer 1, pure math, no React/DOM.
//
// Both Knob (continuous) and RotarySwitch (discrete) draw the same dial:
// a 270° sweep starting at 135° (bottom-left), with pointer/canvas
// convention y-down (0° = pointing right, 90° = pointing down). The gap
// between 405° and 135° (mod 360) is the dead zone at the bottom of the
// dial. This module is the single source of truth for that geometry so
// Knob and RotarySwitch never drift out of sync.

import { clamp } from "@workspace/ui/lib/interaction"

/** Sweep start angle in degrees (y-down convention). */
export const ROTARY_START_DEG = 135
/** Total sweep in degrees. */
export const ROTARY_SWEEP_DEG = 270

/** Map a normalized fraction (expected [0,1]) to a sweep angle in degrees. */
export function fractionToAngleDeg(fraction: number): number {
  return ROTARY_START_DEG + fraction * ROTARY_SWEEP_DEG
}

/**
 * Inverse of fractionToAngleDeg — map a raw pointer angle (degrees, y-down,
 * any real value) back to a fraction in [0,1]. Angles that fall in the
 * bottom dead zone snap to whichever end of the sweep is closer.
 */
export function angleToFraction(deg: number): number {
  // Distance travelled clockwise from START, wrapped into [0, 360).
  const fromStart = (((deg - ROTARY_START_DEG) % 360) + 360) % 360
  // Beyond the sweep is the dead zone — clamp to whichever end is closer
  // (past-270 but < the dead-zone midpoint snaps to the last detent, else
  // the first).
  const clamped =
    fromStart > ROTARY_SWEEP_DEG
      ? fromStart > (ROTARY_SWEEP_DEG + 360) / 2
        ? 0
        : ROTARY_SWEEP_DEG
      : fromStart
  return clamped / ROTARY_SWEEP_DEG
}

/** Normalized fraction [0,1] of detent i across count evenly-spaced detents. */
export function detentFraction(i: number, count: number): number {
  if (count <= 1) return 0
  return clamp(i, 0, count - 1) / (count - 1)
}

/** Nearest detent index for a given normalized fraction across count detents. */
export function nearestDetentIndex(fraction: number, count: number): number {
  if (count <= 1) return 0
  return Math.round(clamp(fraction, 0, 1) * (count - 1))
}
