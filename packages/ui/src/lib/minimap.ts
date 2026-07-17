// Pure positioning + ordering math behind <DocumentMinimap>. The component is
// a thin render layer over these helpers; the semantics that callers and tests
// rely on (clamp, focus/reading order, viewport band, marker → id resolution)
// live here so they can be locked independently of the DOM. Lives under
// src/lib/ to match the package's vitest include globs and the repo convention
// of extracting testable math out of the component body (see timeline-drag-logic).

/** A marker pin on the minimap. `position` is a 0..1 fraction of the document. */
export interface MinimapMarker {
  id: string
  /** 0 (top of document) .. 1 (bottom). Out-of-range values are clamped. */
  position: number
  /** Caller-defined kind; paired with an entry in `kindStyles`. */
  kind: string
  /** Accessible label announced for the marker. */
  label?: string
}

/** The visible window over the document, as 0..1 fractions. Optional. */
export interface MinimapViewport {
  /** Inclusive top of the visible window, 0..1. */
  start: number
  /** Inclusive bottom of the visible window, 0..1. */
  end: number
}

export const MINIMAP_TRACK_MIN = 0
export const MINIMAP_TRACK_MAX = 1

/** Clamp a value into the [0, 1] position range. */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return MINIMAP_TRACK_MIN
  return Math.max(MINIMAP_TRACK_MIN, Math.min(MINIMAP_TRACK_MAX, value))
}

/**
 * Convert a 0..1 marker/window position to a renderable percentage, clamped
 * just shy of 100% so a marker at position 1 stays fully inside the track
 * (its top never exceeds the track height). The cap keeps the last marker's
 * hit-area on-screen rather than flush against the bottom edge.
 */
export function positionToPercent(position: number): number {
  return clamp01(position) * 100
}

/**
 * Order markers ascending by position with a stable sort, so DOM order (and
 * therefore Tab/focus order and screen-reader reading order) follows the
 * document top-to-bottom regardless of how the caller supplied the array.
 * Ties keep their input order. Returns a new array; the input is not mutated.
 */
export function sortByPosition<T extends { position: number }>(markers: readonly T[]): T[] {
  // Stable sort: Array#sort is stable in every engine this template targets
  // (Node 20+, evergreen browsers), so equal positions preserve input order.
  return [...markers].sort((a, b) => a.position - b.position)
}

/**
 * Resolve the marker an activation (click/keyboard) should jump to, given the
 * id the browser delivered. Returns the marker or `undefined` if the id is
 * unknown — the component treats undefined as a no-op rather than throwing,
 * because a stale id (marker removed mid-session) is a recoverable state, not
 * an invariant violation.
 */
export function resolveJumpTarget<M extends MinimapMarker>(markers: readonly M[], id: string): M | undefined {
  return markers.find((marker) => marker.id === id)
}

/**
 * A band spanning this much of the track (or more) reads as "basically the
 * whole document is visible" — there's nothing left to scrub, so it's
 * suppressed rather than rendered as a big empty box dominating the rail.
 * Just under 1 (not exactly 1) so a document that barely overflows, where
 * rounding puts the span at e.g. 0.995, still counts as full coverage.
 */
export const MINIMAP_FULL_COVERAGE_THRESHOLD = 0.99

/**
 * Clamp + order a caller-supplied viewport window into a sane render band:
 * start ≤ end, both in [0, 1]. Returns null — "no viewport indicator" — for
 * a missing/degenerate viewport (start ≥ end) OR one that covers essentially
 * the entire document (nothing to scrub, see MINIMAP_FULL_COVERAGE_THRESHOLD).
 */
export function normalizeViewport(viewport: MinimapViewport | undefined): { start: number; end: number } | null {
  if (!viewport) return null
  const start = clamp01(viewport.start)
  const end = clamp01(viewport.end)
  const span = end - start
  if (span <= 0) return null
  if (span >= MINIMAP_FULL_COVERAGE_THRESHOLD) return null
  return { start, end }
}

// --- Brush interaction math (optional, only exercised when a caller wires
// `onViewportChange`) --------------------------------------------------
//
// The brush is a scrubber: dragging always TRANSLATES the band, it never
// resizes it, so every function below takes the band's `span` as a given
// and only ever solves for its position.

/**
 * Convert a pointer's `clientY` into a 0..1 fraction of a track rect's
 * height. Takes plain numbers (not a DOMRect) so it is unit-testable in
 * node without touching the DOM — the component reads `getBoundingClientRect()`
 * and passes `top`/`height` through.
 */
export function pointerToFraction(clientY: number, trackTop: number, trackHeight: number): number {
  if (trackHeight <= 0) return 0
  return clamp01((clientY - trackTop) / trackHeight)
}

/**
 * Slide a band of the given `span` so its start lands at `start`, clamped to
 * stay inside [0, 1] without ever changing `span` — pinned against an edge
 * rather than resized. This is the clamp behind every brush drag.
 */
export function clampBandStart(start: number, span: number): MinimapViewport {
  const s = clamp01(span)
  const clampedStart = Math.max(0, Math.min(start, 1 - s))
  return { start: clampedStart, end: clampedStart + s }
}

/**
 * Build a band of the given `span` centered on `center` (0..1), edge-clamped
 * via `clampBandStart`. This is the "click empty track" scrubber jump: the
 * band re-centers on the click point, then drags from there.
 */
export function centerBand(center: number, span: number): MinimapViewport {
  return clampBandStart(clamp01(center) - clamp01(span) / 2, span)
}
