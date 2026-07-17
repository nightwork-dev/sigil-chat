// Interaction math core — Layer 1.
//
// Pure functions: total (never throw) and never return NaN for any numeric
// input — including NaN, Infinity, -Infinity, and degenerate or inverted
// domains (max <= min). NaN on the *primary* value resolves to the function's
// documented degenerate bound; a final per-function net keeps the "never NaN
// out" invariant honest for pathological domain parameters.

/** Clamp v to [min, max]. NaN v → min (NaN never propagates out). */
export function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  const r = Math.min(Math.max(v, min), max)
  return Number.isNaN(r) ? min : r
}

/**
 * Snap v to the nearest multiple of `step` measured from `origin`.
 * step <= 0 → v unchanged (passthrough, no clamp). NaN v → origin.
 */
export function snapToStep(v: number, step: number, origin = 0): number {
  if (Number.isNaN(v)) return origin
  if (step <= 0) return v
  const r = origin + Math.round((v - origin) / step) * step
  return Number.isNaN(r) ? origin : r
}

/** Map v in [min, max] to t in [0, 1]. Degenerate domain (max <= min) → 0. */
export function normalize(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return 0
  if (max <= min) return 0
  const clamped = Math.min(Math.max(v, min), max)
  const r = (clamped - min) / (max - min)
  return Number.isNaN(r) ? 0 : r
}

/** Map t in [0, 1] back to [min, max]. NaN t → min. */
export function denormalize(t: number, min: number, max: number): number {
  if (Number.isNaN(t)) return min
  const clampedT = Math.min(Math.max(t, 0), 1)
  const r = min + clampedT * (max - min)
  return Number.isNaN(r) ? min : r
}

/** normalize(v, min, max) * 100, clamped to [0, 100]. Inherits NaN/degenerate behavior. */
export function toPercent(v: number, min: number, max: number): number {
  const r = normalize(v, min, max) * 100
  return Number.isNaN(r) ? 0 : Math.min(Math.max(r, 0), 100)
}
