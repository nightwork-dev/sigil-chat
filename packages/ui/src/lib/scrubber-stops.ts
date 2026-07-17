// Pure stop/zone math behind <TimeScrubber>. The component is a thin render
// layer; the contract callers + a11y + tests rely on — stop ordering, the
// snap-to-nearest rule, pointer→position geometry, and stop-by-stop keyboard
// navigation — lives here so it can be locked independently of the DOM.
// Matches the repo's extract-the-math convention (see lib/minimap.ts).
//
// The inviolable rule this encodes: BETWEEN STOPS IS NOT A VALUE. Every helper
// that resolves an input (pointer, arrow key, Home/End) returns a real stop,
// never a fabricated intermediate position. A drag snaps; an arrow steps
// stop-by-stop; there is no input path that lands between two defined stops.

export interface ScrubberStop {
  id: string;
  /** 0..1 position on the caller's axis. Out-of-range values are clamped. */
  position: number;
  label: string;
  /**
   * Optional visible extent for a range-valued or blurry stop. The stop's
   * `position` remains its keyboard/snap representative; the extent preserves
   * the fact that the selected value occupies more than one point.
   */
  extent?: {
    start: number;
    end: number;
    softStart?: boolean;
    softEnd?: boolean;
  };
}

/** An indeterminate span rendered hatched on the track. 0..1, caller-computed. */
export interface ScrubberZone {
  start: number;
  end: number;
}

export const SCRUBBER_AXIS_MIN = 0;
export const SCRUBBER_AXIS_MAX = 1;

/** Clamp into [0,1]. NaN → 0 (never propagates a poisoned position). */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return SCRUBBER_AXIS_MIN;
  return Math.max(SCRUBBER_AXIS_MIN, Math.min(SCRUBBER_AXIS_MAX, value));
}

/**
 * Order stops ascending by position with a stable sort, so DOM order, Tab
 * order, and screen-reader order all follow the caller's axis regardless of
 * how the array was supplied. Ties keep input order. Returns a new array.
 */
export function sortStops<T extends ScrubberStop>(stops: readonly T[]): T[] {
  return [...stops].sort((a, b) => a.position - b.position);
}

/** Find the index of a stop by id in the SORTED list, or -1 if unknown. */
export function resolveStopIndex(
  stops: readonly ScrubberStop[],
  id: string | null | undefined,
): number {
  if (id == null) return -1;
  return stops.findIndex((stop) => stop.id === id);
}

/**
 * Snap a raw 0..1 position to the NEAREST stop. Ties resolve to the
 * lower-position stop (first in sorted order). Returns undefined for an empty
 * stop set — the component treats that as "no value" rather than inventing one.
 */
export function snapToNearestStop(
  position: number,
  stops: readonly ScrubberStop[],
): ScrubberStop | undefined {
  if (stops.length === 0) return undefined;
  const p = clamp01(position);
  let best = stops[0]!;
  let bestDist = Math.abs(p - clamp01(best.position));
  for (let i = 1; i < stops.length; i++) {
    const stop = stops[i]!;
    const dist = Math.abs(p - clamp01(stop.position));
    // Strict < : on a tie the earlier (lower-position) stop wins, so the
    // snap point is deterministic and never oscillates between two stops.
    if (dist < bestDist) {
      best = stop;
      bestDist = dist;
    }
  }
  return best;
}

/** Id of the stop one step after the current, or null at the last edge / unknown. */
export function nextStopId(
  stops: readonly ScrubberStop[],
  currentId: string | null | undefined,
): string | null {
  const i = resolveStopIndex(stops, currentId);
  if (i < 0 || i + 1 >= stops.length) return null;
  return stops[i + 1]!.id;
}

/** Id of the stop one step before the current, or null at the first edge / unknown. */
export function prevStopId(
  stops: readonly ScrubberStop[],
  currentId: string | null | undefined,
): string | null {
  const i = resolveStopIndex(stops, currentId);
  if (i <= 0) return null;
  return stops[i - 1]!.id;
}

/** Id of the first stop, or null for an empty set. */
export function firstStopId(stops: readonly ScrubberStop[]): string | null {
  return stops[0]?.id ?? null;
}

/** Id of the last stop, or null for an empty set. */
export function lastStopId(stops: readonly ScrubberStop[]): string | null {
  return stops[stops.length - 1]?.id ?? null;
}

/**
 * Convert a pointer's `clientX` into a 0..1 position over a track rect.
 * Takes plain numbers so it is unit-testable in node; the component reads
 * `getBoundingClientRect()` and passes left/width through. Degrades to 0 for
 * a zero/negative-width track instead of dividing by zero.
 */
export function pointerToPosition(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
): number {
  if (trackWidth <= 0) return SCRUBBER_AXIS_MIN;
  return clamp01((clientX - trackLeft) / trackWidth);
}

/**
 * Compose a short text description of the indeterminate zones for the
 * slider's accessible description (aria-describedby), so screen readers
 * announce the hatched spans exist. "1 indeterminate span" / "3 indeterminate
 * spans" / "" when there are none.
 */
export function describeZones(zones: readonly ScrubberZone[]): string {
  const n = zones.length;
  if (n === 0) return "";
  return `${n} indeterminate span${n === 1 ? "" : "s"} on the track`;
}

/** Clamp and order a stop extent for rendering. Degenerate extents are points. */
export function normalizeStopExtent(
  extent: ScrubberStop["extent"],
): { start: number; end: number; softStart: boolean; softEnd: boolean } | null {
  if (!extent) return null;
  const start = clamp01(Math.min(extent.start, extent.end));
  const end = clamp01(Math.max(extent.start, extent.end));
  if (end <= start) return null;
  return {
    start,
    end,
    softStart: Boolean(extent.softStart),
    softEnd: Boolean(extent.softEnd),
  };
}
