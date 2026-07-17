// Shadow-occurrence selection (TIMELINE-UI-AFFORDANCES.md §5.2).
//
// For a recurring series, the non-focused occurrences within the viewport are
// echo bars at their resolved positions. Pure logic — no React — so the cap /
// overflow / modified-vs-cancelled decisions are unit-testable without a canvas.
//
// The focused occurrence (index 0) is drawn by the normal lane layout, so it is
// excluded from the shadow set here; its override start is surfaced separately
// so the focused bar can follow a Cmd-drag that detached it (§4.4).

import { instancesOf } from "./schedule"
import type { OccurrenceOverrides, Schedule, TimeContextProvider } from "./schedule"

/** One echo bar. */
export interface ShadowInstance {
  occurrenceIndex: number
  start: number
  /** null = instantaneous/indefinite. */
  end: number | null
  /** An override exists — render full opacity, not an echo (§5.2). */
  isModified: boolean
  cancelled: boolean
}

export interface SeriesShadows {
  /** The recurring node whose occurrences these are. */
  nodeId: string
  /** In-view echo bars, capped and excluding the focused occurrence. */
  shadows: ShadowInstance[]
  /** Occurrences suppressed by the cap (§5.2). */
  overflowCount: number
  /** Furthest occurrence start among the suppressed ones — the chip's "through <date>". */
  overflowThrough: number | null
  /** Occurrence 0's override start, if any — the focused bar follows it (§4.4). */
  focusedOverrideStart: number | null
}

export const DEFAULT_SHADOW_CAP = 24

/** The first recurring node in a tree (depth-first). The series whose shadows we render. */
export function findRecurringNodeId(tree: Schedule): string | null {
  if (tree.recurrence) return tree.id
  for (const child of tree.children) {
    const found = findRecurringNodeId(child)
    if (found) return found
  }
  return null
}

/**
 * Compute the in-view shadow set for a tree's primary recurring series, capped
 * to the `cap` occurrences nearest the view center (§5.2). Returns null when the
 * tree has no recurring node.
 */
export function computeSeriesShadows(
  tree: Schedule,
  overrides: OccurrenceOverrides,
  provider: TimeContextProvider,
  viewStart: number,
  viewEnd: number,
  cap: number = DEFAULT_SHADOW_CAP,
): SeriesShadows | null {
  const nodeId = findRecurringNodeId(tree)
  if (!nodeId) return null

  const instances = instancesOf(tree, provider, viewStart, viewEnd, overrides)
  const focusedOverrideStart = overrides.get(`${nodeId}:0`)?.start ?? null

  const echoes = instances
    .filter((inst) => inst.occurrenceIndex !== 0)
    .map<ShadowInstance>((inst) => ({
      occurrenceIndex: inst.occurrenceIndex,
      start: inst.resolvedStart,
      end: inst.resolvedEnd,
      isModified: inst.isModified,
      cancelled: inst.cancelled,
    }))

  if (echoes.length <= cap) {
    return { nodeId, shadows: echoes, overflowCount: 0, overflowThrough: null, focusedOverrideStart }
  }

  const center = (viewStart + viewEnd) / 2
  const kept = [...echoes].sort((a, b) => Math.abs(a.start - center) - Math.abs(b.start - center)).slice(0, cap)
  const keptKeys = new Set(kept.map((s) => s.occurrenceIndex))
  const suppressed = echoes.filter((s) => !keptKeys.has(s.occurrenceIndex))
  const overflowThrough = suppressed.reduce((max, s) => Math.max(max, s.start), Number.NEGATIVE_INFINITY)

  return {
    nodeId,
    shadows: kept.sort((a, b) => a.start - b.start),
    overflowCount: suppressed.length,
    overflowThrough: Number.isFinite(overflowThrough) ? overflowThrough : null,
    focusedOverrideStart,
  }
}
