// Pure logic for Timeline.Inspector (TIMELINE-UI-AFFORDANCES.md §4, §5.1).
// Zero React — everything here is a pure function so it can be unit-tested
// without mounting the component. The tsx component imports these; the test
// file (timeline-inspector-logic.test.ts) exercises them directly.

import type {
  Alignment,
  BoundsMode,
  DurationSpec,
  Offset,
  Quantum,
  QuantumMode,
  RecurrenceRule,
  Schedule,
} from "@workspace/ui/lib/timeline/schedule/types"
import { alignmentCycles } from "@workspace/ui/lib/timeline/schedule/graph"

// ─── The controlled-component contract (exported types) ─────────────────────

/**
 * A single-node edit. Fields are whole replacements, not partials — the
 * component reads the node's current offset/duration/alignment, applies the
 * one field the user touched, and emits the full updated object so the
 * consumer applies it with no merge logic. Every field is independent and
 * optional; a given edit sets exactly one.
 */
export interface InspectorPatch {
  alignment?: Alignment
  offset?: Offset
  duration?: DurationSpec
}

/**
 * Bounds-mode toggle intent (§4.3). `frozenWindow` carries the derived window
 * to pin as authored bounds on an auto→fixed switch, *if* the presentational
 * layer was given one via the `derivedWindow` prop; otherwise it is null and
 * the consumer computes the freeze itself. On fixed→auto there is nothing to
 * freeze, so it is always null.
 */
export interface BoundsToggle {
  mode: BoundsMode
  frozenWindow: { start: number; end: number | null } | null
}

// ─── Time units (display only) ──────────────────────────────────────────────
//
// The tree stores spans as plain numbers in its time context. The inspector's
// min/h/d selectors (§4.1) assume the app's wallClock context, which is Unix
// MILLISECONDS (the store, demo data, and Date.now() all speak ms — only the
// conformance corpus uses seconds, and it never touches this UI). The factors
// below convert between the stored base value and the displayed one.

export type TimeUnit = "min" | "h" | "d"

export const UNIT_MS: Record<TimeUnit, number> = {
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
}

export const TIME_UNITS: { value: TimeUnit; label: string }[] = [
  { value: "min", label: "min" },
  { value: "h", label: "h" },
  { value: "d", label: "d" },
]

/** The coarsest unit that divides `base` cleanly — the natural way to show it. */
export function naturalUnit(base: number): TimeUnit {
  if (base === 0) return "h"
  const abs = Math.abs(base)
  if (abs % UNIT_MS.d === 0) return "d"
  if (abs % UNIT_MS.h === 0) return "h"
  return "min"
}

export function fromBase(base: number, unit: TimeUnit): number {
  return base / UNIT_MS[unit]
}

export function toBase(value: number, unit: TimeUnit): number {
  return value * UNIT_MS[unit]
}

// ─── Quantum presets (§4.2) ─────────────────────────────────────────────────

export const QUANTUM_PRESETS: { label: string; unit: number }[] = [
  { label: "15 min", unit: 900_000 },
  { label: "1 hour", unit: 3_600_000 },
  { label: "1 day", unit: 86_400_000 },
  { label: "1 week", unit: 604_800_000 },
]

export const QUANTUM_MODES: QuantumMode[] = ["nearest", "floor", "ceil"]

// ─── Constraint-field builders (patch emission shapes) ──────────────────────
//
// Each returns a new spec with one field changed. `undefined` clears an
// optional field (min/max/quantum). These are what the component calls to
// produce the object it hands to onChange — testing them locks the emitted
// shape without mounting React.

export type DurationField = "basis" | "min" | "max" | "flex"
export type OffsetField = "basis" | "min" | "max" | "flex"

export function setDurationField(d: DurationSpec, field: DurationField, value: number | undefined): DurationSpec {
  const next = { ...d }
  if (value === undefined) {
    if (field === "basis" || field === "flex") return next // required fields never cleared
    delete next[field]
  } else {
    next[field] = value
  }
  return next
}

export function setOffsetField(o: Offset, field: OffsetField, value: number | undefined): Offset {
  const next = { ...o }
  if (value === undefined) {
    if (field === "basis" || field === "flex") return next
    delete next[field]
  } else {
    next[field] = value
  }
  return next
}

export function setDurationQuantum(d: DurationSpec, quantum: Quantum | undefined): DurationSpec {
  const next = { ...d }
  if (quantum === undefined) delete next.quantum
  else next.quantum = quantum
  return next
}

export function setOffsetQuantum(o: Offset, quantum: Quantum | undefined): Offset {
  const next = { ...o }
  if (quantum === undefined) delete next.quantum
  else next.quantum = quantum
  return next
}

// ─── Sibling-anchor eligibility (§4.1, DAG rule from core §2.2) ─────────────

export type AnchorKind = "start-parent" | "end-parent" | "start-sibling" | "end-sibling"

export function anchorKindOf(alignment: Alignment): AnchorKind {
  switch (alignment.kind) {
    case "startOfParent":
      return "start-parent"
    case "endOfParent":
      return "end-parent"
    case "startOf":
      return "start-sibling"
    case "endOf":
      return "end-sibling"
  }
}

/** All ids in a subtree except the root's own — the node's descendants. */
export function descendantIds(node: Schedule): Set<string> {
  const out = new Set<string>()
  const walk = (n: Schedule) => {
    for (const child of n.children) {
      out.add(child.id)
      walk(child)
    }
  }
  walk(node)
  return out
}

/**
 * Which siblings this node may anchor to (§4.1). Excludes the node itself, its
 * descendants, and any sibling whose alignment chain already reaches the node —
 * the full DAG rule (core §2.2), including mutual sibling cycles that a naive
 * self/descendant filter misses.
 *
 * Implemented via the shared `alignmentCycles` helper: for each candidate we
 * probe the hypothetical edge (node aligned to candidate) and reject it iff the
 * node lands in a cycle. This reuses the same SCC detection the validator uses,
 * so the picker and the validator can never disagree about what's legal.
 */
export function eligibleSiblingAnchors(node: Schedule, siblings: Schedule[]): Schedule[] {
  const descendants = descendantIds(node)
  const others = siblings.filter((s) => s.id !== node.id && !descendants.has(s.id))

  return others.filter((candidate) => {
    const probe: Schedule = {
      kind: "vector",
      id: node.id,
      offset: { basis: 0, direction: "after", flex: 0 },
      duration: { basis: 0, flex: 0 },
      alignment: { kind: "endOf", siblingId: candidate.id },
      boundsMode: "fixed",
      children: [],
    }
    const group = [...others, probe]
    const cycles = alignmentCycles(group)
    return !cycles.some((cycle) => cycle.includes(node.id))
  })
}

// ─── Recurrence summary line (§5.1) ─────────────────────────────────────────

export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

function frequencyPhrase(rule: RecurrenceRule): string {
  const interval = rule.interval ?? 1
  if (rule.frequency === "custom") return interval === 1 ? "Every interval" : `Every ${interval} intervals`
  const unit = { hourly: "hour", daily: "day", weekly: "week", monthly: "month" }[rule.frequency]
  return interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`
}

function dayPhrase(rule: RecurrenceRule): string {
  if ((rule.frequency === "daily" || rule.frequency === "weekly") && rule.daysOfWeek?.length) {
    const labels = [...rule.daysOfWeek].sort((a, b) => a - b).map((d) => DOW_LABELS[d] ?? `?${d}`)
    return ` on ${labels.join(", ")}`
  }
  if (rule.frequency === "monthly" && rule.daysOfMonth?.length) {
    const labels = [...rule.daysOfMonth].sort((a, b) => a - b).map(ordinal)
    return ` on the ${labels.join(", ")}`
  }
  return ""
}

/**
 * Plain-text description of a recurrence rule (§5.1), e.g.
 * "Every 2 weeks on Mon, Wed — 8 occurrences, ending Aug 15".
 * `formatValue` renders the `until` scalar into the caller's calendar; the
 * default is a bare number since the time context may not be wall-clock.
 */
export function recurrenceSummary(rule: RecurrenceRule, formatValue: (value: number) => string = String): string {
  let s = frequencyPhrase(rule) + dayPhrase(rule)
  const end: string[] = []
  if (rule.count != null) end.push(`${rule.count} occurrence${rule.count === 1 ? "" : "s"}`)
  if (rule.until != null) end.push(`ending ${formatValue(rule.until)}`)
  if (end.length) s += ` — ${end.join(", ")}`
  return s
}

/** Both count and until set → the "first of:" display, not the radio (§5.1). */
export function isBothEndConditions(rule: RecurrenceRule): boolean {
  return rule.count != null && rule.until != null
}
