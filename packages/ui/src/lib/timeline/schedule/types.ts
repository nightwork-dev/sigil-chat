// Schedule primitive — core types, per SCHEDULE-SPEC-v2.md v0.3 §1, §4, §5.
// Pure data, zero React. The spec is normative; where a comment cites a section,
// that section governs. Trees are immutable — every operator returns new data.

/** JSON-serializable value. Metadata/payload data must be serializable (spec §12). */
export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

// ─── Time context (§1.8) ────────────────────────────────────────────────────

export type TimeContext =
  | { kind: "wallClock"; unit?: "seconds" | "milliseconds" }
  | { kind: "turnCount" }
  | { kind: "narrativeTime"; worldId: string }
  | { kind: "gameTick"; tickRate: number }
  | { kind: "custom"; domain: string; calendarBearing?: boolean }

/** Resolver contract: the current value of a time context (§1.8, v0.1 unchanged). */
export interface TimeContextProvider {
  currentValue(context: TimeContext): number
}

// ─── Constraint shapes (§1.5–1.7) ───────────────────────────────────────────

export type QuantumMode = "nearest" | "floor" | "ceil"

/** Legal-values grid for durations/offsets; boundary grid for trim (§1.7). */
export interface Quantum {
  /** Grid period, > 0. */
  unit: number
  mode: QuantumMode
  /** Grid phase, in the tree's time context. Ignored for spans; used by trim (§8). */
  origin?: number
}

/** Duration with compression structure (§1.6). `basis: 0` = event; then no min/max/flex/quantum. */
export interface DurationSpec {
  basis: number
  min?: number
  max?: number
  /** Compression/stretch weight; 0 = rigid. */
  flex: number
  quantum?: Quantum
}

export type Direction = "after" | "before"

/** Offset: magnitude + explicit direction, same constraint shape as a duration (§1.5). */
export interface Offset {
  basis: number
  direction: Direction
  min?: number
  max?: number
  flex: number
  quantum?: Quantum
}

/** Serialization sugar (§1.5–1.6): accepted on input, normalized before use. */
export type DurationInput = number | (Partial<DurationSpec> & { basis: number })
export type OffsetInput =
  | { duration: number; direction: Direction }
  | (Partial<Offset> & { basis: number; direction: Direction })

// ─── Alignment (§1.4) ───────────────────────────────────────────────────────

export type Alignment =
  | { kind: "startOfParent" }
  | { kind: "endOfParent" }
  | { kind: "startOf"; siblingId: string }
  | { kind: "endOf"; siblingId: string }

// ─── Bounds (§3) ────────────────────────────────────────────────────────────

export type BoundsMode = "fixed" | "auto"

// ─── Recurrence (§5.1) ──────────────────────────────────────────────────────

export type Frequency = "hourly" | "daily" | "weekly" | "monthly" | "custom"

export interface RecurrenceRule {
  frequency: Frequency
  /** Every N units. Default 1. */
  interval?: number
  /** Filter, 0=Sunday..6=Saturday. Valid for daily and weekly (§5.1). */
  daysOfWeek?: number[]
  /** Filter, 1..31. Valid for monthly. */
  daysOfMonth?: number[]
  /** For frequency "custom": spacing in the node's time context. */
  customInterval?: number
  /** Max occurrences, counted over the UNFILTERED series (§5.3). */
  count?: number
  /** Recurrence end, exclusive, in the node's time context. First of count/until stops the series. */
  until?: number
  /** Occurrence starts to skip. Time-context scalars, not calendar dates. */
  excludeValues?: number[]
  includeValues?: number[]
}

// ─── Payload (§1.9) ─────────────────────────────────────────────────────────

export interface SchedulePayload {
  type: string
  data: { [key: string]: JSONValue }
}

// ─── Schedule tree (§1.1–1.3) ───────────────────────────────────────────────

export interface AbsoluteSchedule {
  kind: "absolute"
  id: string
  /** Value in the time context. For an auto node this is the SEED (§3.2), not the derived start. */
  start: number
  /** undefined = INDEFINITE, always (spec §1.2 as of 0.3.1). An instantaneous absolute is end === start. Ignored (keep absent) under auto. */
  end?: number
  timeContext: TimeContext
  boundsMode: BoundsMode
  recurrence?: RecurrenceRule
  payload?: SchedulePayload
  children: Schedule[]
  metadata?: { [key: string]: JSONValue }
}

export interface VectorSchedule {
  kind: "vector"
  id: string
  offset: Offset
  duration: DurationSpec
  alignment: Alignment
  boundsMode: BoundsMode
  recurrence?: RecurrenceRule
  payload?: SchedulePayload
  children: Schedule[]
  metadata?: { [key: string]: JSONValue }
}

export type Schedule = AbsoluteSchedule | VectorSchedule

// ─── Resolved state (§4) ────────────────────────────────────────────────────

/** Where this window came from (§4.2). A vector's alignment-computed window counts as pinned. */
export type Provenance = "pinned" | "derived"

/** How this window sits in its parent's bounds (§4.2). free = parent is auto, or no parent. */
export type BoundsStatus = "free" | "bounded" | "conflicting"

export type Edge = "start" | "end"

/** Present iff boundsStatus === "conflicting" (§4.3). A value, not an error. */
export interface ConflictInfo {
  edge: Edge
  /** By how much; null = unbounded (indefinite child, finite parent). */
  overrun: number | null
  /** Would compress(parent window) repair this? minimalWindow test (§7.5). */
  compressible: boolean
}

export interface ResolvedSchedule {
  id: string
  resolvedStart: number
  /** null = instantaneous or indefinite. */
  resolvedEnd: number | null
  provenance: Provenance
  boundsStatus: BoundsStatus
  conflict?: ConflictInfo
  /** For recurring nodes: true iff ANY occurrence is active (§5.2). */
  isActive: boolean
  isPending: boolean
  isExpired: boolean
  /** duration basis === 0. */
  isEvent: boolean
  payload?: SchedulePayload
  children: ResolvedSchedule[]
}

// ─── Occurrences (§5.3) ─────────────────────────────────────────────────────

export interface OccurrenceOverride {
  /** Moved occurrence: new resolved start. */
  start?: number
  /** Resized occurrence: new duration. */
  duration?: number
  cancelled?: boolean
}

/** Host-owned, keyed `${scheduleId}:${occurrenceIndex}`. Indexes are stable under exclusion (§5.3). */
export type OccurrenceOverrides = Map<string, OccurrenceOverride>

export interface ResolvedInstance {
  scheduleId: string
  /** Index into the UNFILTERED generated series (§5.3). */
  occurrenceIndex: number
  resolvedStart: number
  resolvedEnd: number | null
  /** An override exists for this key. */
  isModified: boolean
  cancelled: boolean
  /** The base resolved subtree, translated to this occurrence (§5.2). */
  subtree: ResolvedSchedule
}

export function overrideKey(scheduleId: string, occurrenceIndex: number): string {
  return `${scheduleId}:${occurrenceIndex}`
}

// ─── Validation (§2) ────────────────────────────────────────────────────────

export type ValidationCode =
  | "root-not-absolute"
  | "alignment-cycle"
  | "end-of-parent-under-auto"
  | "calendar-frequency-context"
  | "constraint-sanity"
  | "off-quantum-value"
  | "sibling-target-missing"
  | "duplicate-node-id"
  | "nested-recurrence"

export interface ValidationError {
  code: ValidationCode
  /** The offending node (or cycle members for alignment-cycle). */
  nodeIds: string[]
  message: string
}

// ─── Compression / trim (§7–8) ──────────────────────────────────────────────

export interface NodeAdjustment {
  nodeId: string
  /** "duration" or "offset" — which span was adjusted. */
  target: "duration" | "offset"
  from: number
  to: number
}

export type CompressResult =
  | { ok: true; compressed: Schedule; report: NodeAdjustment[] }
  | { ok: false; deficit: number; blockers: string[] }

export type TrimPolicy = "nearest" | "expand" | "contract"

/** Instantiation pipeline operators (§8.1). */
export type MaterializeOp =
  | { kind: "compress"; nodeId: string; targetSpan: number }
  | { kind: "trim"; nodeId: string; grid: Quantum; policy: TrimPolicy }
