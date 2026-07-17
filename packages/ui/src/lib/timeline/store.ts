// Timeline store — migrated to the schedule-tree architecture (US-008).
//
// The source of truth is now a single immutable schedule tree (a root
// `AbsoluteSchedule` per timeline document, `./schedule`), not a flat event
// map. The flat `events`/`relationships` shapes the existing `timeline.tsx`
// consumers still speak are DERIVED on demand via the memoized `selectEvents`
// / `selectRelationships` selectors below — never stored; derivation runs the
// engine's `resolve()` on every tree replacement.
//
// What this migration adds over the old flat store:
//   - operation-level undo/redo (snapshot stack of {tree, overrides}, §7)
//   - a structural duration clamp on every mutation path (UI spec §1.3):
//     drag/resize can never produce a zero or inverted duration; crossing to
//     duration 0 ("event-ification") is only reachable through the explicit
//     `setEventDuration` action, never a drag/resize. `MIN_DURATION_MS` is gone.
//   - an override store (Map keyed `${scheduleId}:${occurrenceIndex}`, §6),
//     written via `writeOverride`, passed to occurrence accessors by future
//     consumers.
//   - a legacy import path (`importLegacyEvents`) that lifts flat
//     events + relationships into a rigid all-`Absolute` tree (UI spec §8; no
//     inferred vector relationships — those are an inspector action).
//
// A factory function, not a module-level singleton — two `<Timeline.Root>`s on
// one page get independent state.

import { create } from "zustand"
import {
  compress,
  minimalWindow,
  overrideKey,
  resolve,
  trim,
  type AbsoluteSchedule,
  type Alignment,
  type BoundsMode,
  type BoundsStatus,
  type CompressResult,
  type ConflictInfo,
  type Direction,
  type DurationSpec,
  type JSONValue,
  type Offset,
  type OccurrenceOverride,
  type OccurrenceOverrides,
  type Provenance,
  type Quantum,
  type QuantumMode,
  type RecurrenceRule,
  type ResolvedSchedule,
  type Schedule,
  type TimeContext,
  type TimeContextProvider,
  type TrimPolicy,
  type VectorSchedule,
} from "./schedule"
import type { TimelineEvent, TimelineRelationship } from "./types"

export type DragMode = "move" | "resize-start" | "resize-end"

export interface DragState {
  eventId: string
  mode: DragMode
}

/**
 * A single-node inspector edit (§4.1–4.2): whole-object field replacements, not
 * partials. Structurally identical to the presentational inspector's
 * `InspectorPatch`, redeclared here so `lib/` doesn't depend on `components/`.
 */
export interface NodePatch {
  alignment?: Alignment
  offset?: Offset
  duration?: DurationSpec
}

/** Bounds-mode toggle intent (§4.3). `frozenWindow` populated only on auto→fixed. */
export interface BoundsToggleInput {
  mode: BoundsMode
  frozenWindow: { start: number; end: number | null } | null
}

/** One point in undo history. Trees/overrides are immutable, so a snapshot is a cheap reference pair. */
interface Snapshot {
  tree: AbsoluteSchedule
  overrides: OccurrenceOverrides
}

export interface TimelineState {
  /** Source of truth: a single root Absolute node per document (§1). */
  tree: AbsoluteSchedule
  /** Host-owned per-occurrence overrides (§6), keyed `${scheduleId}:${occurrenceIndex}`. */
  overrides: OccurrenceOverrides
  selection: string[]
  dragging: DragState | null
  viewStart: number
  viewEnd: number
  /** Undo stack: snapshots BEFORE each committed operation. */
  past: Snapshot[]
  /** Redo stack. */
  future: Snapshot[]
  /**
   * Coalescing key for the in-flight continuous gesture. Consecutive
   * move/resize calls sharing a key fold into ONE history entry (a drag is
   * one undo step, §7); any other action, selection change, or drag toggle
   * resets it so the next operation starts a fresh entry.
   */
  coalesceKey: string | null
  /**
   * Node ids the canvas outlines as destructive (§4.5): the rigid / at-floor
   * children a failed Fit couldn't shrink. Set on Fit failure, cleared on the
   * next successful mutation or selection change (a failure moves nothing, so
   * the highlight is the only trace it leaves).
   */
  blockers: string[]
}

export interface TimelineActions {
  addEvent: (event: TimelineEvent) => void
  updateEvent: (id: string, updates: Partial<TimelineEvent>) => void
  deleteEvent: (id: string) => void
  deleteSelected: () => void
  /** Shifts only this node — descendants keep their absolute times. */
  moveEvent: (id: string, deltaMs: number) => void
  /** Shifts this node and its entire descendant subtree by the same delta (drag semantics for absolute nodes). */
  moveEventCascade: (id: string, deltaMs: number) => void
  /**
   * Resize a range node's start or end edge. Clamps so duration stays
   * `>= max(authored min ?? 0, epsilon)` and never inverts (§1.3); it can
   * never event-ify. `epsilon` is one ambient grid unit supplied by the
   * caller (default 1s) — the gesture floor.
   */
  resizeEvent: (id: string, edge: "start" | "end", deltaMs: number, epsilonMs?: number) => void
  /** The ONLY path to duration 0 / event-ification (§1.3). `durationMs <= 0` makes the node instantaneous. */
  setEventDuration: (id: string, durationMs: number) => void
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void
  setDragging: (drag: DragState | null) => void
  setViewRange: (start: number, end: number) => void
  setParent: (childId: string, parentId: string | undefined) => void
  /** Write (or, with `null`, clear) a per-occurrence override (§6). One history entry. */
  writeOverride: (scheduleId: string, occurrenceIndex: number, override: OccurrenceOverride | null) => void
  /**
   * Move a single occurrence's resolved start (§4.4 Cmd-drag), preserving its
   * duration/cancelled override fields. Coalesces per (node, index) so a drag is
   * ONE undo entry, unlike the discrete `writeOverride`.
   */
  moveOccurrence: (scheduleId: string, occurrenceIndex: number, startMs: number) => void
  /** Cancel / uncancel one occurrence (§5.2). One history entry. */
  cancelOccurrence: (scheduleId: string, occurrenceIndex: number, cancelled: boolean) => void
  /**
   * Fit a parent to `targetSpan` via core `compress()` (§4.5). Success commits
   * the compressed tree as ONE undo entry and clears blockers; failure moves
   * nothing and records `blockers` for canvas highlighting. Returns the raw
   * `CompressResult` so the caller can render the per-child report or deficit.
   */
  fit: (nodeId: string, targetSpan: number) => CompressResult
  /** Trim a node's resolved window to `grid` under `policy` (§4.5 / core §8). One undo entry. */
  trimNode: (nodeId: string, grid: Quantum, policy: TrimPolicy) => void
  /** Compress-then-trim preset (§4.5 / core §8.1). Fit failure aborts the whole op, nothing moves. */
  compressThenTrim: (nodeId: string, targetSpan: number, grid: Quantum, policy: TrimPolicy) => CompressResult
  /** The read-only feasibility floor shown beside the Fit input (§4.5 / core §7.5). */
  minimalWindowOf: (nodeId: string) => number
  /** Apply one inspector field edit — whole-object replacement on a vector node (§4.1–4.2). One undo entry. */
  applyPatch: (nodeId: string, patch: NodePatch) => void
  /** Toggle a node's bounds mode (§4.3); auto→fixed freezes the derived window as authored bounds. One undo entry. */
  setBoundsMode: (nodeId: string, toggle: BoundsToggleInput) => void
  /** Set (or, with `null`, clear) a node's recurrence rule (§5.1). One undo entry. */
  setRecurrence: (nodeId: string, rule: RecurrenceRule | null) => void
  /** Clear the Fit-failure blocker highlight. */
  clearBlockers: () => void
  /** Replace the tree by importing flat legacy data (UI spec §8). */
  importLegacy: (events: TimelineEvent[], relationships?: Record<string, TimelineRelationship>) => void
  undo: () => void
  redo: () => void
}

export type TimelineStore = TimelineState & TimelineActions

const HISTORY_CAP = 100
const DEFAULT_RESIZE_EPSILON_MS = 1000
const ROOT_ID = "__timeline_root__"
const WALL_CLOCK: TimeContext = { kind: "wallClock", unit: "milliseconds" }

// Legacy timelines live entirely in wall-clock Unix ms.
const WALL_CLOCK_PROVIDER: TimeContextProvider = { currentValue: () => Date.now() }

// ─── Tree ↔ flat-event mapping ──────────────────────────────────────────────
// Title/description/color are domain data (§1.9) — carried in `payload.data`,
// round-tripped so the flat consumers keep seeing exactly what they authored.

function eventToNode(event: TimelineEvent, children: Schedule[] = [], base?: AbsoluteSchedule): AbsoluteSchedule {
  const data: { [key: string]: JSONValue } = { title: event.title }
  if (event.description != null) data.description = event.description
  if (event.color != null) data.color = event.color
  const start = event.type === "instantaneous" ? event.timestamp : event.startTime
  // Instantaneous = zero-width (end === start), NOT nil. Nil end means INDEFINITE
  // (spec §1.2 as of 0.3.1) — importing legacy point markers as indefinite would
  // silently change their meaning from "at this instant" to "from here, forever".
  const end = event.type === "instantaneous" ? event.timestamp : event.endTime
  return {
    kind: "absolute",
    id: event.id,
    start,
    end,
    timeContext: base?.timeContext ?? WALL_CLOCK,
    boundsMode: base?.boundsMode ?? "fixed",
    recurrence: base?.recurrence,
    payload: { type: "timeline-event", data },
    children,
    metadata: base?.metadata,
  }
}

function payloadTriple(payloadData: { [key: string]: JSONValue } | undefined) {
  const data = payloadData ?? {}
  // Schedule-tree payloads name the display string `label` (spec §10); flat
  // legacy events use `title`. Read either so both seed paths show a bar label.
  const title = typeof data.title === "string" ? data.title : typeof data.label === "string" ? data.label : ""
  const description = typeof data.description === "string" ? data.description : undefined
  const color = typeof data.color === "string" ? data.color : undefined
  return { title, description, color }
}

function baseEvent(id: string, title: string, description?: string, color?: string) {
  const base: { id: string; title: string; description?: string; color?: string } = { id, title }
  if (description != null) base.description = description
  if (color != null) base.color = color
  return base
}

function nodeToEvent(node: AbsoluteSchedule): TimelineEvent {
  const { title, description, color } = payloadTriple(node.payload?.data)
  const base = baseEvent(node.id, title, description, color)
  // A node with no end (or a zero-width window) is an event / instantaneous marker.
  if (node.end == null || node.end === node.start) {
    return { ...base, type: "instantaneous", timestamp: node.start }
  }
  return { ...base, type: "range", startTime: node.start, endTime: node.end }
}

function resolvedToEvent(node: ResolvedSchedule): TimelineEvent {
  const { title, description, color } = payloadTriple(node.payload?.data)
  const base = baseEvent(node.id, title, description, color)
  if (node.isEvent || node.resolvedEnd == null || node.resolvedEnd === node.resolvedStart) {
    return { ...base, type: "instantaneous", timestamp: node.resolvedStart }
  }
  return { ...base, type: "range", startTime: node.resolvedStart, endTime: node.resolvedEnd }
}

// ─── Immutable tree operations ──────────────────────────────────────────────

function findNode(node: Schedule, id: string): Schedule | null {
  if (node.id === id) return node
  for (const child of node.children) {
    const hit = findNode(child, id)
    if (hit) return hit
  }
  return null
}

/** Replace node `id` with `updater(node)`, rebuilding only the ancestor spine (structural sharing elsewhere). */
function updateNode(root: AbsoluteSchedule, id: string, updater: (node: Schedule) => Schedule): AbsoluteSchedule {
  function rec(node: Schedule): Schedule {
    if (node.id === id) return updater(node)
    if (node.children.length === 0) return node
    let changed = false
    const children = node.children.map((child) => {
      const next = rec(child)
      if (next !== child) changed = true
      return next
    })
    return changed ? { ...node, children } : node
  }
  return rec(root) as AbsoluteSchedule
}

/**
 * Shift a subtree by delta — cascade/drag semantics. For an absolute TARGET
 * node this shifts its own start/end and recurses into every descendant (the
 * existing absolute cascade). For a vector TARGET node (UI spec §4.4) the
 * move is entirely absorbed by `offset` (see `moveVector`) — children are
 * left untouched: vector descendants auto-follow via resolve()'s alignment
 * chain off this node's new resolved position, and absolute descendants are
 * anchored to their own `start`/`end` regardless of parent, so an explicit
 * shift here would double-move them relative to what the offset change
 * already does.
 */
function shiftSubtree(node: Schedule, delta: number): Schedule {
  if (node.kind === "absolute") {
    return {
      ...node,
      start: node.start + delta,
      end: node.end == null ? node.end : node.end + delta,
      children: node.children.map((child) => shiftSubtreeNested(child, delta)),
    }
  }
  return moveVector(node, delta)
}

/** Cascade recursion below the TARGET node — unchanged nested behavior: absolute descendants shift, vector descendants keep their own offset (they auto-follow their shifted absolute ancestor via resolve()). */
function shiftSubtreeNested(node: Schedule, delta: number): Schedule {
  if (node.kind === "absolute") {
    return {
      ...node,
      start: node.start + delta,
      end: node.end == null ? node.end : node.end + delta,
      children: node.children.map((child) => shiftSubtreeNested(child, delta)),
    }
  }
  return { ...node, children: node.children.map((child) => shiftSubtreeNested(child, delta)) }
}

function shiftSelf(node: Schedule, delta: number): Schedule {
  if (node.kind === "vector") return moveVector(node, delta)
  return { ...node, start: node.start + delta, end: node.end == null ? node.end : node.end + delta }
}

/** Structural resize clamp (§1.3): never zero, never inverted, never event-ifies. */
function resizeAbsolute(node: AbsoluteSchedule, edge: "start" | "end", delta: number, epsilon: number): AbsoluteSchedule {
  if (node.end == null || node.end === node.start) return node // indefinite or zero-width — no edge to drag
  const authoredMin = typeof node.metadata?.minDuration === "number" ? node.metadata.minDuration : 0
  const floor = Math.max(authoredMin, epsilon)
  if (edge === "start") {
    const newStart = Math.min(node.start + delta, node.end - floor)
    return { ...node, start: newStart }
  }
  const newEnd = Math.max(node.end + delta, node.start + floor)
  return { ...node, end: newEnd }
}

function setAbsoluteDuration(node: AbsoluteSchedule, durationMs: number): AbsoluteSchedule {
  if (durationMs <= 0) return { ...node, end: undefined } // event-ification (§1.3)
  return { ...node, end: node.start + durationMs }
}

// ─── Vector move/resize (UI spec §4.4, offset-editing semantics) ───────────
//
// A vector node has no absolute start/end — its position is `anchorPoint +
// signedOffset(offset)` (resolve.ts's `signedOffset`, mirrored here since
// resolve.ts is frozen and never imported by the store). Moving/resizing a
// vector node therefore means rewriting `offset.basis`/`direction` and/or
// `duration.basis`, never an absolute timestamp.

/** Mirrors resolve.ts `signedOffset` — after ⇒ +basis, before ⇒ −basis. */
function signedOffset(basis: number, direction: Direction): number {
  return direction === "after" ? basis : -basis
}

/** Decompose a signed displacement back into {direction, basis}: flip at zero, magnitude non-negative (never clamp). */
function decomposeSignedOffset(signed: number): { direction: Direction; basis: number } {
  return signed >= 0 ? { direction: "after", basis: signed } : { direction: "before", basis: -signed }
}

/** Round `value` to `quantum`'s own grid using `quantum`'s own mode (or an override), per §1.1(1) — the node's own quantum always wins. Origin is ignored for spans (spec §1.7). */
function snapToQuantum(value: number, quantum: Quantum | undefined, modeOverride?: QuantumMode): number {
  if (!quantum || quantum.unit <= 0) return value
  const mode = modeOverride ?? quantum.mode
  const ratio = value / quantum.unit
  const n = mode === "floor" ? Math.floor(ratio) : mode === "ceil" ? Math.ceil(ratio) : Math.round(ratio)
  return n * quantum.unit
}

/**
 * Snap to grid, then guarantee the structural floor (§1.3) even if the
 * quantum's own rounding mode (nearest/floor) would otherwise land below it —
 * the floor is a store-level safety net, independent of gesture ergonomics.
 */
function snapAboveFloor(value: number, floor: number, quantum: Quantum | undefined): number {
  const snapped = snapToQuantum(Math.max(value, floor), quantum)
  return snapped >= floor ? snapped : snapToQuantum(floor, quantum, "ceil")
}

/**
 * MOVE on a vector node (§4.4): edit `offset.basis`/`direction` by the signed
 * time displacement `delta` produces, per resolve.ts's interpretation — flip
 * direction at zero, never clamp at the anchor, never go negative. Children
 * are NOT touched here: vector descendants auto-follow through resolve()
 * (their anchor derives from this node's resolved position), and absolute
 * descendants are anchored to their own `start`/`end` regardless of parent
 * (resolve.ts `resolveNode`) — shifting them explicitly would double-move
 * them relative to what an unmoved vector parent already leaves them at.
 */
function moveVector(node: VectorSchedule, delta: number): VectorSchedule {
  const signed = signedOffset(node.offset.basis, node.offset.direction) + delta
  const { direction, basis } = decomposeSignedOffset(signed)
  return { ...node, offset: { ...node.offset, direction, basis: snapToQuantum(basis, node.offset.quantum) } }
}

/** RESIZE "end" on a vector node (§4.4): duration.basis += delta, floored at max(min ?? 0, epsilon), never zero/inverted. */
function resizeVectorEnd(node: VectorSchedule, delta: number, epsilon: number): VectorSchedule {
  const floor = Math.max(node.duration.min ?? 0, epsilon)
  const basis = snapAboveFloor(node.duration.basis + delta, floor, node.duration.quantum)
  return { ...node, duration: { ...node.duration, basis } }
}

/**
 * RESIZE "start" on a vector node (§4.4): move the start edge, keep the
 * resolved END fixed — offset absorbs `delta` (same flip rule as move) while
 * duration.basis absorbs `-delta`, so `resolvedStart + resolvedEnd`'s span
 * stays anchored at the same end point. Mirrors `resizeAbsolute`'s contract
 * exactly: when growing duration (`delta < 0`) there's no floor to hit, but
 * when shrinking (`delta > 0`) past the floor the amount of delta actually
 * absorbed is CAPPED at `duration.basis - floor` — both offset and duration
 * absorb the same capped delta, so the resolved end point stays put instead
 * of drifting once the floor engages (same invariant `resizeAbsolute` keeps
 * by clamping `newStart` against `end - floor` rather than letting `end`
 * itself move). Quantum snapping is applied after capping and can still
 * introduce a small drift, same as `resizeVectorEnd`.
 */
function resizeVectorStart(node: VectorSchedule, delta: number, epsilon: number): VectorSchedule {
  const floor = Math.max(node.duration.min ?? 0, epsilon)
  const maxShrink = Math.max(0, node.duration.basis - floor)
  const cappedDelta = delta > 0 ? Math.min(delta, maxShrink) : delta
  const signed = signedOffset(node.offset.basis, node.offset.direction) + cappedDelta
  const { direction, basis: offsetBasis } = decomposeSignedOffset(signed)
  const durationBasis = snapAboveFloor(node.duration.basis - cappedDelta, floor, node.duration.quantum)
  return {
    ...node,
    offset: { ...node.offset, direction, basis: snapToQuantum(offsetBasis, node.offset.quantum) },
    duration: { ...node.duration, basis: durationBasis },
  }
}

/** Remove node `id`, promoting its children into its former slot so nested events survive the delete. */
function removeNodePromoting(root: AbsoluteSchedule, id: string): AbsoluteSchedule {
  function rec(node: Schedule): Schedule {
    const idx = node.children.findIndex((child) => child.id === id)
    if (idx >= 0) {
      const target = node.children[idx]
      return { ...node, children: [...node.children.slice(0, idx), ...target.children, ...node.children.slice(idx + 1)] }
    }
    let changed = false
    const children = node.children.map((child) => {
      const next = rec(child)
      if (next !== child) changed = true
      return next
    })
    return changed ? { ...node, children } : node
  }
  return rec(root) as AbsoluteSchedule
}

/** Detach node `id` and its whole subtree (no promotion) — used to move a subtree during reparenting. */
function detachNode(root: AbsoluteSchedule, id: string): AbsoluteSchedule {
  function rec(node: Schedule): Schedule {
    const idx = node.children.findIndex((child) => child.id === id)
    if (idx >= 0) return { ...node, children: [...node.children.slice(0, idx), ...node.children.slice(idx + 1)] }
    let changed = false
    const children = node.children.map((child) => {
      const next = rec(child)
      if (next !== child) changed = true
      return next
    })
    return changed ? { ...node, children } : node
  }
  return rec(root) as AbsoluteSchedule
}

function reparent(root: AbsoluteSchedule, childId: string, parentId: string | undefined): AbsoluteSchedule {
  if (childId === root.id) return root
  const child = findNode(root, childId)
  if (!child) return root
  const targetParentId = parentId ?? root.id
  if (targetParentId === childId) return root
  // Cycle guard: the new parent must not live inside the child's own subtree.
  if (findNode(child, targetParentId)) return root
  if (!findNode(root, targetParentId)) return root
  const detached = detachNode(root, childId)
  return updateNode(detached, targetParentId, (parent) => ({ ...parent, children: [...parent.children, child] }))
}

/** Apply one inspector patch to a node — whole-object field replacement (§4.1–4.2). Vector fields no-op on absolute nodes. */
function applyPatchToNode(node: Schedule, patch: NodePatch): Schedule {
  if (node.kind !== "vector") return node
  return {
    ...node,
    alignment: patch.alignment ?? node.alignment,
    offset: patch.offset ?? node.offset,
    duration: patch.duration ?? node.duration,
  }
}

/**
 * Toggle a node's bounds mode (§4.3). auto→fixed freezes the derived window as
 * authored bounds (an absolute node pins start/end; a vector node pins its
 * duration basis to the derived span, keeping its alignment-derived start).
 * fixed→auto discards the authored bounds an absolute node carried.
 */
function applyBoundsMode(node: Schedule, mode: BoundsMode, frozenWindow: { start: number; end: number | null } | null): Schedule {
  if (mode === node.boundsMode) return node
  if (node.kind === "absolute") {
    if (mode === "fixed" && frozenWindow) {
      return { ...node, boundsMode: "fixed", start: frozenWindow.start, end: frozenWindow.end ?? undefined }
    }
    // fixed → auto: the derived window supersedes the authored end (spec §1.2/§3).
    return { ...node, boundsMode: "auto", end: undefined }
  }
  if (mode === "fixed" && frozenWindow && frozenWindow.end !== null) {
    return { ...node, boundsMode: "fixed", duration: { ...node.duration, basis: Math.max(0, frozenWindow.end - frozenWindow.start) } }
  }
  return { ...node, boundsMode: mode }
}

function applyRecurrence(node: Schedule, rule: RecurrenceRule | null): Schedule {
  if (rule === null) {
    const { recurrence: _removed, ...rest } = node
    return rest as Schedule
  }
  return { ...node, recurrence: rule }
}

/** The resolved window of a node, for the derivedWindow the bounds toggle freezes (§4.3). */
export function resolvedWindowOf(root: AbsoluteSchedule, id: string): { start: number; end: number | null } | null {
  let resolved: ResolvedSchedule
  try {
    resolved = resolve(root, WALL_CLOCK_PROVIDER)
  } catch {
    return null
  }
  const stack: ResolvedSchedule[] = [resolved]
  while (stack.length) {
    const node = stack.pop()!
    if (node.id === id) return { start: node.resolvedStart, end: node.resolvedEnd }
    stack.push(...node.children)
  }
  return null
}

// ─── Legacy import (UI spec §8) ─────────────────────────────────────────────

/**
 * Lift flat `events` + parent/child `relationships` into a rigid all-`Absolute`
 * tree under a single root. Ids/titles/colors are preserved; NO vector
 * relationships are inferred — absolute times can't tell you whether an event
 * was "3pm Tuesday" or "2h after sibling A ends", so everything imports as
 * `Absolute`/`fixed` and relativizing is left to a later inspector action.
 */
export function importLegacyEvents(events: TimelineEvent[], relationships: Record<string, TimelineRelationship> = {}): AbsoluteSchedule {
  const byId = new Map(events.map((event) => [event.id, event]))
  const childIdsOf = (id: string) => relationships[id]?.childIds ?? []

  // A node is "top level" unless it appears as some other node's child.
  const isChild = new Set<string>()
  for (const event of events) {
    for (const childId of childIdsOf(event.id)) {
      if (byId.has(childId)) isChild.add(childId)
    }
  }

  const used = new Set<string>()
  function build(id: string, ancestors: Set<string>): AbsoluteSchedule | null {
    const event = byId.get(id)
    if (!event || ancestors.has(id)) return null // missing or cyclic
    used.add(id)
    const nextAncestors = new Set(ancestors).add(id)
    const children = childIdsOf(id)
      .filter((childId) => byId.has(childId) && !nextAncestors.has(childId) && !used.has(childId))
      .map((childId) => build(childId, nextAncestors))
      .filter((node): node is AbsoluteSchedule => node !== null)
    return eventToNode(event, children)
  }

  const topLevel: AbsoluteSchedule[] = []
  for (const event of events) {
    if (isChild.has(event.id)) continue
    const node = build(event.id, new Set())
    if (node) topLevel.push(node)
  }
  // Any event not reached above (e.g. trapped in a relationship cycle) is promoted
  // to top level rather than silently dropped.
  for (const event of events) {
    if (used.has(event.id)) continue
    const node = build(event.id, new Set())
    if (node) topLevel.push(node)
  }

  const starts = events.map((event) => (event.type === "instantaneous" ? event.timestamp : event.startTime))
  return {
    kind: "absolute",
    id: ROOT_ID,
    start: starts.length ? Math.min(...starts) : 0,
    end: undefined,
    timeContext: WALL_CLOCK,
    boundsMode: "fixed",
    payload: { type: "timeline-root", data: {} },
    children: topLevel,
    metadata: {},
  }
}

// ─── Derived render list (memoized selector — never stored) ─────────────────

/**
 * Per-node render facts the canvas needs beyond the flat event's geometry
 * (UI spec §2–3): how the resolved window sits in its parent (`boundsStatus`
 * + `conflict`), whether the window was authored or computed (`provenance`,
 * driving the derived-parent dashed/low-opacity treatment), whether the node
 * is a zero-duration event, and the node's own snapping grid (`quantumMs`,
 * the §1.1(1) precedence the drag gesture can never bypass). Absolute nodes
 * carry no quantum; only vector nodes do (their `duration`/`offset` grids).
 */
export interface NodeRenderMeta {
  boundsStatus: BoundsStatus
  conflict?: ConflictInfo
  provenance: Provenance
  isEvent: boolean
  quantumMs?: number
  /**
   * Occurrence 0 (the focused occurrence this node's flat bar represents) is
   * cancelled by an override (§5.2). Undefined when no cancel override exists —
   * consumers render a cancelled bar slashed, mirroring a cancelled shadow.
   */
  cancelled?: boolean
}

interface DerivedRender {
  events: Record<string, TimelineEvent>
  relationships: Record<string, TimelineRelationship>
  meta: Record<string, NodeRenderMeta>
}

/** The node's own gesture-snapping grid (§1.1(1)) — vector duration/offset quantum only; absolute nodes have none. */
function nodeQuantumMs(node: Schedule): number | undefined {
  if (node.kind !== "vector") return undefined
  return node.duration.quantum?.unit ?? node.offset.quantum?.unit
}

/** Source-tree walk collecting each node's snapping quantum by id (resolve() drops it, so read it here). */
function collectQuantum(root: Schedule): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {}
  function walk(node: Schedule) {
    for (const child of node.children) {
      out[child.id] = nodeQuantumMs(child)
      walk(child)
    }
  }
  walk(root)
  return out
}

function deriveRenderFromResolved(resolved: ResolvedSchedule, quantumById: Record<string, number | undefined>): DerivedRender {
  const events: Record<string, TimelineEvent> = {}
  const relationships: Record<string, TimelineRelationship> = {}
  const meta: Record<string, NodeRenderMeta> = {}
  const rootId = resolved.id
  function walk(parent: ResolvedSchedule) {
    const parentIsRoot = parent.id === rootId
    for (const child of parent.children) {
      events[child.id] = resolvedToEvent(child)
      relationships[child.id] = {
        parentId: parentIsRoot ? undefined : parent.id,
        childIds: child.children.map((grandchild) => grandchild.id),
      }
      meta[child.id] = {
        boundsStatus: child.boundsStatus,
        conflict: child.conflict,
        provenance: child.provenance,
        isEvent: child.isEvent,
        quantumMs: quantumById[child.id],
      }
      walk(child)
    }
  }
  walk(resolved)
  return { events, relationships, meta }
}

/**
 * Fold each node's occurrence-0 override into its flat event/meta. Occurrence 0
 * is the focused occurrence a node's base bar represents (§4.4/§5.2), so its
 * override — a moved `start` (duration preserved), a resized `duration`, or a
 * `cancelled` flag — belongs on the flat event the way the engine's occurrence
 * accessors report it (mirrors `makeInstance` for index 0 in occurrences.ts).
 *
 * The fold is occurrence-0 ONLY. Occurrences 1..N stay the separate shadow
 * projection (`computeSeriesShadows` / §5.2); folding them into the flat list
 * would render each occurrence twice. It keys purely on override presence, so a
 * non-recurring node with a `${id}:0` override folds too and multiple recurring
 * series each fold their own occurrence 0 — no dependence on recurrence detection.
 */
function foldOccurrenceZero(render: DerivedRender, overrides: OccurrenceOverrides): DerivedRender {
  if (overrides.size === 0) return render
  let events = render.events
  let meta = render.meta
  for (const id of Object.keys(render.events)) {
    const override = overrides.get(overrideKey(id, 0))
    if (!override) continue
    const base = render.events[id]
    const baseStart = base.type === "instantaneous" ? base.timestamp : base.startTime
    const baseEnd = base.type === "instantaneous" ? null : base.endTime
    const baseDuration = baseEnd === null ? null : baseEnd - baseStart
    const movedStart = override.start ?? baseStart
    const movedDuration = override.duration ?? baseDuration
    const movedEnd = movedDuration === null ? null : movedStart + movedDuration
    if (override.start != null || override.duration != null) {
      if (events === render.events) events = { ...render.events }
      const b = baseEvent(id, base.title, base.description, base.color)
      events[id] =
        movedEnd === null || movedEnd === movedStart
          ? { ...b, type: "instantaneous", timestamp: movedStart }
          : { ...b, type: "range", startTime: movedStart, endTime: movedEnd }
    }
    if (override.cancelled != null) {
      if (meta === render.meta) meta = { ...render.meta }
      meta[id] = { ...render.meta[id], cancelled: override.cancelled }
    }
  }
  return events === render.events && meta === render.meta ? render : { events, relationships: render.relationships, meta }
}

function deriveRender(root: AbsoluteSchedule, overrides: OccurrenceOverrides): DerivedRender {
  const quantumById = collectQuantum(root)
  const resolved = resolve(root, WALL_CLOCK_PROVIDER)
  const base = deriveRenderFromResolved(resolved, quantumById)
  return foldOccurrenceZero(base, overrides)
}

// Memoized by (tree, overrides) identity: both are immutable and replaced on
// every mutation (the tree on structural edits, the overrides Map on every
// override write — `writeOverride`/`moveOccurrence`/`cancelOccurrence` each
// `new Map(...)` before mutating), so the nested WeakMap yields a stable
// reference while neither changes — zustand's Object.is check then skips
// re-renders. Keying on the tree alone would serve a stale render after an
// occurrence-0 override changed the flat list without touching the tree.
const RENDER_CACHE = new WeakMap<AbsoluteSchedule, WeakMap<OccurrenceOverrides, DerivedRender>>()

function selectRender(state: TimelineState): DerivedRender {
  let byOverrides = RENDER_CACHE.get(state.tree)
  if (!byOverrides) {
    byOverrides = new WeakMap()
    RENDER_CACHE.set(state.tree, byOverrides)
  }
  const cached = byOverrides.get(state.overrides)
  if (cached) return cached
  const derived = deriveRender(state.tree, state.overrides)
  byOverrides.set(state.overrides, derived)
  return derived
}

/** Flat event map derived from the tree. Stable reference while the tree is unchanged. */
export const selectEvents = (state: TimelineState): Record<string, TimelineEvent> => selectRender(state).events
/** Flat parent/child relationship map derived from the tree. */
export const selectRelationships = (state: TimelineState): Record<string, TimelineRelationship> => selectRender(state).relationships
/** Per-node render facts (bounds/conflict/provenance/isEvent/quantum) keyed by node id (§2–3). */
export const selectMeta = (state: TimelineState): Record<string, NodeRenderMeta> => selectRender(state).meta

// ─── Store factory ──────────────────────────────────────────────────────────

export interface CreateTimelineStoreOptions {
  events?: TimelineEvent[]
  viewStart: number
  viewEnd: number
  /** Initial parent → children links, keyed by child id. Seeded once at mount, same as `events`. */
  relationships?: Record<string, TimelineRelationship>
  /**
   * Seed directly from a schedule tree (§1), bypassing the flat legacy import.
   * Takes precedence over `events` — the path for vector/recurring demos that
   * can't be expressed as flat absolute events.
   */
  tree?: AbsoluteSchedule
}

export function createTimelineStore({ events = [], viewStart, viewEnd, relationships = {}, tree: seedTree }: CreateTimelineStoreOptions) {
  const tree = seedTree ?? importLegacyEvents(events, relationships)

  return create<TimelineStore>((set, get) => {
    /**
     * Apply an immutable mutation and record undo history. `mutate` returns the
     * next tree/overrides (plus any non-history fields like `selection`); a
     * matching `coalesceKey` folds into the previous entry (continuous gesture =
     * one undo step), otherwise a fresh baseline is pushed.
     */
    function commit(mutate: (state: TimelineState) => Partial<TimelineState> | null, coalesceKey: string | null) {
      set((state) => {
        const result = mutate(state)
        if (!result) return state
        const { tree: nextTreeRaw, overrides: nextOverridesRaw, ...extra } = result
        const nextTree = nextTreeRaw ?? state.tree
        const nextOverrides = nextOverridesRaw ?? state.overrides
        const changed = nextTree !== state.tree || nextOverrides !== state.overrides
        if (!changed) return { ...extra } // only non-history fields moved (e.g. selection) — no undo entry
        const before: Snapshot = { tree: state.tree, overrides: state.overrides }
        const coalesce = coalesceKey != null && state.coalesceKey === coalesceKey
        const past = coalesce ? state.past : [...state.past, before].slice(-HISTORY_CAP)
        // A committed change moves things, so a stale Fit-failure highlight no
        // longer describes the tree — drop it.
        const blockers = state.blockers.length ? [] : state.blockers
        return { tree: nextTree, overrides: nextOverrides, past, future: [], coalesceKey, blockers, ...extra }
      })
    }

    return {
      tree,
      overrides: new Map(),
      selection: [],
      dragging: null,
      viewStart,
      viewEnd,
      past: [],
      future: [],
      coalesceKey: null,
      blockers: [],

      addEvent: (event) =>
        commit((s) => ({ tree: { ...s.tree, children: [...s.tree.children, eventToNode(event)] } }), null),

      updateEvent: (id, updates) =>
        commit((s) => {
          const node = findNode(s.tree, id)
          if (!node || node.kind !== "absolute") return null
          const merged = { ...nodeToEvent(node), ...updates } as TimelineEvent
          const rebuilt = eventToNode(merged, node.children, node)
          return { tree: updateNode(s.tree, id, () => rebuilt) }
        }, null),

      deleteEvent: (id) =>
        commit((s) => ({ tree: removeNodePromoting(s.tree, id), selection: s.selection.filter((sid) => sid !== id) }), null),

      deleteSelected: () =>
        commit((s) => {
          let next = s.tree
          for (const id of s.selection) next = removeNodePromoting(next, id)
          return { tree: next, selection: [] }
        }, null),

      moveEvent: (id, deltaMs) =>
        commit((s) => ({ tree: updateNode(s.tree, id, (node) => shiftSelf(node, deltaMs)) }), `move:${id}`),

      moveEventCascade: (id, deltaMs) =>
        commit((s) => ({ tree: updateNode(s.tree, id, (node) => shiftSubtree(node, deltaMs)) }), `moveCascade:${id}`),

      resizeEvent: (id, edge, deltaMs, epsilonMs = DEFAULT_RESIZE_EPSILON_MS) =>
        commit(
          (s) => ({
            tree: updateNode(s.tree, id, (node) => {
              if (node.kind === "absolute") return resizeAbsolute(node, edge, deltaMs, epsilonMs)
              return edge === "end" ? resizeVectorEnd(node, deltaMs, epsilonMs) : resizeVectorStart(node, deltaMs, epsilonMs)
            }),
          }),
          `resize:${id}:${edge}`,
        ),

      setEventDuration: (id, durationMs) =>
        commit((s) => ({ tree: updateNode(s.tree, id, (node) => (node.kind === "absolute" ? setAbsoluteDuration(node, durationMs) : node)) }), null),

      setSelection: (ids) => set({ selection: ids, coalesceKey: null, blockers: [] }),
      toggleSelection: (id) =>
        set((s) => ({
          selection: s.selection.includes(id) ? s.selection.filter((sid) => sid !== id) : [...s.selection, id],
          coalesceKey: null,
          blockers: [],
        })),
      clearSelection: () => set({ selection: [], coalesceKey: null, blockers: [] }),
      setDragging: (drag) => set({ dragging: drag, coalesceKey: null }),
      setViewRange: (start, end) => set({ viewStart: start, viewEnd: end }),

      setParent: (childId, parentId) =>
        commit((s) => ({ tree: reparent(s.tree, childId, parentId) }), null),

      writeOverride: (scheduleId, occurrenceIndex, override) =>
        commit((s) => {
          const key = overrideKey(scheduleId, occurrenceIndex)
          const next = new Map(s.overrides)
          if (override == null) next.delete(key)
          else next.set(key, override)
          return { overrides: next }
        }, null),

      moveOccurrence: (scheduleId, occurrenceIndex, startMs) =>
        commit((s) => {
          const key = overrideKey(scheduleId, occurrenceIndex)
          const prev = s.overrides.get(key)
          const next = new Map(s.overrides)
          next.set(key, { ...prev, start: startMs })
          return { overrides: next }
        }, `occ:${scheduleId}:${occurrenceIndex}`),

      cancelOccurrence: (scheduleId, occurrenceIndex, cancelled) =>
        commit((s) => {
          const key = overrideKey(scheduleId, occurrenceIndex)
          const prev = s.overrides.get(key)
          const next = new Map(s.overrides)
          next.set(key, { ...prev, cancelled })
          return { overrides: next }
        }, null),

      fit: (nodeId, targetSpan) => {
        const result = compress(get().tree, nodeId, targetSpan)
        if (result.ok) commit(() => ({ tree: result.compressed as AbsoluteSchedule }), null)
        else set({ blockers: result.blockers })
        return result
      },

      trimNode: (nodeId, grid, policy) =>
        commit((s) => ({ tree: trim(s.tree, nodeId, grid, policy) as AbsoluteSchedule }), null),

      compressThenTrim: (nodeId, targetSpan, grid, policy) => {
        const result = compress(get().tree, nodeId, targetSpan)
        if (!result.ok) {
          set({ blockers: result.blockers })
          return result
        }
        const trimmed = trim(result.compressed, nodeId, grid, policy) as AbsoluteSchedule
        commit(() => ({ tree: trimmed }), null)
        return result
      },

      minimalWindowOf: (nodeId) => {
        try {
          return minimalWindow(get().tree, nodeId)
        } catch {
          return 0
        }
      },

      applyPatch: (nodeId, patch) =>
        commit((s) => ({ tree: updateNode(s.tree, nodeId, (node) => applyPatchToNode(node, patch)) }), null),

      setBoundsMode: (nodeId, toggle) =>
        commit((s) => ({ tree: updateNode(s.tree, nodeId, (node) => applyBoundsMode(node, toggle.mode, toggle.frozenWindow)) }), null),

      setRecurrence: (nodeId, rule) =>
        commit((s) => ({ tree: updateNode(s.tree, nodeId, (node) => applyRecurrence(node, rule)) }), null),

      clearBlockers: () => set((s) => (s.blockers.length ? { blockers: [] } : s)),

      importLegacy: (nextEvents, nextRelationships = {}) =>
        commit(() => ({ tree: importLegacyEvents(nextEvents, nextRelationships) }), null),

      undo: () =>
        set((s) => {
          if (s.past.length === 0) return s
          const prev = s.past[s.past.length - 1]
          const current: Snapshot = { tree: s.tree, overrides: s.overrides }
          return {
            tree: prev.tree,
            overrides: prev.overrides,
            past: s.past.slice(0, -1),
            future: [...s.future, current],
            coalesceKey: null,
          }
        }),

      redo: () =>
        set((s) => {
          if (s.future.length === 0) return s
          const next = s.future[s.future.length - 1]
          const current: Snapshot = { tree: s.tree, overrides: s.overrides }
          return {
            tree: next.tree,
            overrides: next.overrides,
            past: [...s.past, current],
            future: s.future.slice(0, -1),
            coalesceKey: null,
          }
        }),
    }
  })
}
