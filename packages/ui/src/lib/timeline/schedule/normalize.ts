// Serialization sugar → canonical forms (SCHEDULE-SPEC-v2.md §1.5–1.6).
// Fixtures and consumers may author `duration: 3600` or `offset: { duration, direction }`;
// the engine only ever sees DurationSpec / Offset.

import type {
  DurationInput,
  DurationSpec,
  Offset,
  OffsetInput,
  Schedule,
} from "./types"

export function normalizeDuration(input: DurationInput): DurationSpec {
  if (typeof input === "number") return { basis: input, flex: 0 }
  return { flex: 0, ...input }
}

export function normalizeOffset(input: OffsetInput): Offset {
  if ("duration" in input) {
    return { basis: input.duration, direction: input.direction, flex: 0 }
  }
  return { flex: 0, ...input }
}

/** Zero offset, the common "at the anchor" case. */
export const ZERO_OFFSET: Offset = { basis: 0, direction: "after", flex: 0 }

/**
 * Deep-normalize a tree whose vector nodes may carry sugared duration/offset
 * (as parsed from fixture JSON). Absolute nodes pass through; children recurse.
 */
export function normalizeSchedule(node: Schedule): Schedule {
  if (node.kind === "absolute") {
    return { ...node, children: node.children.map(normalizeSchedule) }
  }
  return {
    ...node,
    duration: normalizeDuration(node.duration as unknown as DurationInput),
    offset: normalizeOffset(node.offset as unknown as OffsetInput),
    children: node.children.map(normalizeSchedule),
  }
}
