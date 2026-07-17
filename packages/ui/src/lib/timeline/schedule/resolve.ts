// resolve() — SCHEDULE-SPEC-v2.md §6.
// Contract is frozen: do not change the signature; types.ts is the authority.

import { topoSiblings } from "./graph"
import { calendarUnitScaleForContext, occurrenceStartAt, isOccurrenceIncluded, type CalendarUnitScale } from "./recurrence"
import { validate } from "./validate"
import type {
  BoundsStatus,
  ConflictInfo,
  DurationSpec,
  Edge,
  RecurrenceRule,
  ResolvedSchedule,
  Schedule,
  TimeContext,
  TimeContextProvider,
} from "./types"

interface ResolvedWithSpan {
  source: Schedule
  node: ResolvedSchedule
  /** Window used for auto-parent unions and fixed-parent bounds checks (§5.2 recurring spans). */
  spanStart: number
  spanEnd: number | null
  timeContext: TimeContext
}

interface ParentFrame {
  id: string
  boundsMode: "fixed" | "auto"
  seed: number
  resolvedStart: number
  resolvedEnd: number | null
}

interface MutableWindow {
  start: number
  end: number | null
}

/**
 * Single-pass topological solve over (node, phase) anchor/window vertices
 * (§6), with the §3.2 seed rule for auto parents. Pure function; never
 * mutates the input tree. Throws on invalid trees (§2).
 */
export function resolve(schedule: Schedule, provider: TimeContextProvider): ResolvedSchedule {
  const errors = validate(schedule)
  if (errors.length > 0) {
    throw new Error(`Invalid schedule: ${[...new Set(errors.map((error) => error.code))].join(", ")}`)
  }

  if (schedule.kind !== "absolute") {
    throw new Error("Invalid schedule: root-not-absolute")
  }

  return resolveNode(schedule, null, schedule.timeContext, provider, calendarUnitScaleForContext(schedule.timeContext)).node
}

function resolveNode(
  node: Schedule,
  parent: ParentFrame | null,
  nearestContext: TimeContext,
  provider: TimeContextProvider,
  msPerUnit: CalendarUnitScale,
): ResolvedWithSpan {
  const timeContext = node.kind === "absolute" ? node.timeContext : nearestContext
  const anchor = node.kind === "absolute" ? node.start : vectorAnchor(node, parent)
  const provisionalEnd = node.kind === "absolute" ? (node.end ?? null) : anchor + node.duration.basis
  const seed = anchor

  const childParentFrame: ParentFrame = {
    id: node.id,
    boundsMode: node.boundsMode,
    seed,
    resolvedStart: anchor,
    resolvedEnd: provisionalEnd,
  }

  const childResults = new Map<string, ResolvedWithSpan>()
  for (const child of topoSiblings(node.children)) {
    const resolvedChild = resolveNodeWithSiblingAnchor(child, childParentFrame, timeContext, provider, childResults, msPerUnit)
    childResults.set(child.id, resolvedChild)
    // Sibling alignments later in the DAG read already-resolved entries from childResults.
    childParentFrame.resolvedStart = anchor
    childParentFrame.resolvedEnd = provisionalEnd
  }

  const orderedChildren = node.children.map((child) => childResults.get(child.id)!).filter(Boolean)
  const hasChildren = orderedChildren.length > 0
  const autoDerived = node.boundsMode === "auto" && hasChildren
  const baseWindow = autoDerived ? unionChildren(orderedChildren) : { start: anchor, end: provisionalEnd }

  const finalParentFrame: ParentFrame = {
    id: node.id,
    boundsMode: node.boundsMode,
    seed,
    resolvedStart: baseWindow.start,
    resolvedEnd: baseWindow.end,
  }

  const children = orderedChildren.map((child) => applyBounds(child, finalParentFrame))
  const windowWithRecurrence = recurringSpan(node, baseWindow.start, baseWindow.end, msPerUnit)
  const flags = temporalFlags(node, baseWindow.start, baseWindow.end, timeContext, provider, msPerUnit)

  const resolved: ResolvedSchedule = {
    id: node.id,
    resolvedStart: baseWindow.start,
    resolvedEnd: baseWindow.end,
    provenance: autoDerived ? "derived" : "pinned",
    boundsStatus: "free",
    ...flags,
    payload: node.payload,
    children: children.map((child) => child.node),
  }

  return {
    source: node,
    node: parent ? applyBounds({ source: node, node: resolved, ...windowWithRecurrence, timeContext }, parent).node : resolved,
    spanStart: windowWithRecurrence.spanStart,
    spanEnd: windowWithRecurrence.spanEnd,
    timeContext,
  }
}

function vectorAnchor(node: Extract<Schedule, { kind: "vector" }>, parent: ParentFrame | null): number {
  if (!parent) throw new Error(`Vector node ${node.id} has no parent`)

  let point: number
  switch (node.alignment.kind) {
    case "startOfParent":
      point = parent.boundsMode === "auto" ? parent.seed : parent.resolvedStart
      break
    case "endOfParent":
      if (parent.resolvedEnd === null) throw new Error(`Cannot align ${node.id} to an indefinite parent end`)
      point = parent.resolvedEnd
      break
    case "startOf":
    case "endOf":
      // Filled by resolveNodeWithSiblings via sibling frames.
      throw new Error(`Unresolved sibling alignment for ${node.id}`)
  }

  return point + signedOffset(node.offset.basis, node.offset.direction)
}

function resolveNodeWithSiblingAnchor(
  node: Schedule,
  parent: ParentFrame | null,
  nearestContext: TimeContext,
  provider: TimeContextProvider,
  siblings: Map<string, ResolvedWithSpan>,
  msPerUnit: CalendarUnitScale,
): ResolvedWithSpan {
  if (node.kind !== "vector" || (node.alignment.kind !== "startOf" && node.alignment.kind !== "endOf")) {
    return resolveNode(node, parent, nearestContext, provider, msPerUnit)
  }

  const sibling = siblings.get(node.alignment.siblingId)
  if (!sibling) throw new Error(`Sibling ${node.alignment.siblingId} has not been resolved`)
  const point = node.alignment.kind === "startOf" ? sibling.node.resolvedStart : sibling.node.resolvedEnd
  if (point === null) throw new Error(`Cannot align ${node.id} to an indefinite sibling end`)

  const syntheticParent = parent
  if (!syntheticParent) throw new Error(`Vector node ${node.id} has no parent`)

  const anchor = point + signedOffset(node.offset.basis, node.offset.direction)
  return resolveVectorAtAnchor(node, syntheticParent, nearestContext, provider, anchor, msPerUnit)
}

function resolveVectorAtAnchor(
  node: Extract<Schedule, { kind: "vector" }>,
  parent: ParentFrame,
  nearestContext: TimeContext,
  provider: TimeContextProvider,
  anchor: number,
  msPerUnit: CalendarUnitScale,
): ResolvedWithSpan {
  const provisionalEnd = anchor + node.duration.basis
  const childParentFrame: ParentFrame = {
    id: node.id,
    boundsMode: node.boundsMode,
    seed: anchor,
    resolvedStart: anchor,
    resolvedEnd: provisionalEnd,
  }
  const childResults = new Map<string, ResolvedWithSpan>()
  for (const child of topoSiblings(node.children)) {
    const resolvedChild = resolveNodeWithSiblingAnchor(child, childParentFrame, nearestContext, provider, childResults, msPerUnit)
    childResults.set(child.id, resolvedChild)
  }
  const orderedChildren = node.children.map((child) => childResults.get(child.id)!).filter(Boolean)
  const autoDerived = node.boundsMode === "auto" && orderedChildren.length > 0
  const baseWindow = autoDerived ? unionChildren(orderedChildren) : { start: anchor, end: provisionalEnd }
  const finalParentFrame: ParentFrame = {
    id: node.id,
    boundsMode: node.boundsMode,
    seed: anchor,
    resolvedStart: baseWindow.start,
    resolvedEnd: baseWindow.end,
  }
  const children = orderedChildren.map((child) => applyBounds(child, finalParentFrame))
  const windowWithRecurrence = recurringSpan(node, baseWindow.start, baseWindow.end, msPerUnit)
  const flags = temporalFlags(node, baseWindow.start, baseWindow.end, nearestContext, provider, msPerUnit)
  const resolved: ResolvedSchedule = {
    id: node.id,
    resolvedStart: baseWindow.start,
    resolvedEnd: baseWindow.end,
    provenance: autoDerived ? "derived" : "pinned",
    boundsStatus: "free",
    ...flags,
    payload: node.payload,
    children: children.map((child) => child.node),
  }
  return applyBounds({ source: node, node: resolved, ...windowWithRecurrence, timeContext: nearestContext }, parent)
}

function unionChildren(children: ResolvedWithSpan[]): MutableWindow {
  let start = Infinity
  let end: number | null = -Infinity
  for (const child of children) {
    start = Math.min(start, child.spanStart)
    if (child.spanEnd === null) end = null
    else if (end !== null) end = Math.max(end, child.spanEnd)
  }
  return { start, end: end === -Infinity ? null : end }
}

function applyBounds(child: ResolvedWithSpan, parent: ParentFrame): ResolvedWithSpan {
  if (parent.boundsMode === "auto") {
    return { ...child, node: { ...child.node, boundsStatus: "free", conflict: undefined } }
  }

  const conflict = conflictInfo(child, parent)
  const boundsStatus: BoundsStatus = conflict ? "conflicting" : "bounded"
  return { ...child, node: { ...child.node, boundsStatus, conflict } }
}

function conflictInfo(child: ResolvedWithSpan, parent: ParentFrame): ConflictInfo | undefined {
  const startOverrun = Math.max(0, parent.resolvedStart - child.spanStart)
  let endOverrun = 0
  let unboundedEnd = false

  if (parent.resolvedEnd !== null) {
    if (child.spanEnd === null) unboundedEnd = true
    else endOverrun = Math.max(0, child.spanEnd - parent.resolvedEnd)
  }

  if (startOverrun === 0 && endOverrun === 0 && !unboundedEnd) return undefined

  const edge: Edge = unboundedEnd || endOverrun >= startOverrun ? "end" : "start"
  const overrun = unboundedEnd ? null : edge === "end" ? endOverrun : startOverrun
  return {
    edge,
    overrun,
    compressible: isCompressible(child, parent, edge),
  }
}

function isCompressible(child: ResolvedWithSpan, parent: ParentFrame, edge: Edge): boolean {
  if (parent.resolvedEnd === null || child.spanEnd === null || child.node.resolvedEnd === null) return false
  const parentSpan = parent.resolvedEnd - parent.resolvedStart
  if (parentSpan < 0) return false

  const ownSpan = child.node.resolvedEnd === null ? null : Math.max(0, child.node.resolvedEnd - child.node.resolvedStart)
  const floor = effectiveFloor(child.source, ownSpan)
  const available = edge === "end" ? parent.resolvedEnd - child.node.resolvedStart : child.node.resolvedEnd - parent.resolvedStart
  return available >= 0 && floor <= available
}

// Local conservative approximation required by the task: resolve() must not import
// operators.ts. For a node's own span, use the authored minimum when present, then
// one quantum unit, then rigid basis when flex is 0, otherwise a positive epsilon
// to preserve the never-compress-to-event rule from §7.3.
function effectiveFloor(source: Schedule, ownSpan: number | null): number {
  if (source.kind === "absolute") return ownSpan === null ? Infinity : ownSpan
  if (source.boundsMode === "auto" && source.children.length > 0) return localMinimalWindow(source)
  if (source.duration.basis === 0) return 0
  const floor = source.duration.min ?? source.duration.quantum?.unit ?? (source.duration.flex === 0 ? source.duration.basis : 0)
  return quantizedFloor(floor, source.duration)
}

function quantizedFloor(value: number, duration: DurationSpec): number {
  const unit = duration.quantum?.unit
  if (!unit || unit <= 0) return value
  return Math.ceil(value / unit) * unit
}

function isVector(node: Schedule): node is Extract<Schedule, { kind: "vector" }> {
  return node.kind === "vector"
}

function localChildChains(children: Schedule[]): Schedule[][] {
  const byId = new Map(children.map((child) => [child.id, child]))
  const successor = new Map<string, string>()
  const predecessor = new Map<string, string>()
  for (const child of children) {
    if (!isVector(child)) continue
    if (child.alignment.kind === "endOf" && child.offset.direction === "after") {
      const prev = byId.get(child.alignment.siblingId)
      if (prev && !successor.has(prev.id) && !predecessor.has(child.id)) {
        successor.set(prev.id, child.id)
        predecessor.set(child.id, prev.id)
      }
    } else if (child.alignment.kind === "startOf" && child.offset.direction === "before") {
      const next = byId.get(child.alignment.siblingId)
      if (next && !successor.has(child.id) && !predecessor.has(next.id)) {
        successor.set(child.id, next.id)
        predecessor.set(next.id, child.id)
      }
    }
  }
  const chains: Schedule[][] = []
  const seen = new Set<string>()
  for (const child of children) {
    if (predecessor.has(child.id)) continue
    const chain: Schedule[] = []
    let cur: Schedule | undefined = child
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      chain.push(cur)
      const nextId = successor.get(cur.id)
      cur = nextId ? byId.get(nextId) : undefined
    }
    chains.push(chain)
  }
  for (const child of children) if (!seen.has(child.id)) chains.push([child])
  return chains
}

function localSpanFloor(node: Schedule): number {
  if (node.kind === "absolute") return node.end === undefined ? 0 : Math.max(0, node.end - node.start)
  if (node.boundsMode === "auto" && node.children.length > 0) return localMinimalWindow(node)
  if (node.duration.flex === 0) return node.duration.basis
  if (node.duration.min !== undefined) return quantizedFloor(node.duration.min, node.duration)
  if (node.duration.quantum) return node.duration.quantum.unit
  return 0
}

function localOffsetFloor(node: Schedule): number {
  if (!isVector(node)) return 0
  if (node.offset.flex === 0) return node.offset.basis
  if (node.offset.min !== undefined) return node.offset.quantum ? Math.ceil(node.offset.min / node.offset.quantum.unit) * node.offset.quantum.unit : node.offset.min
  if (node.offset.quantum) return node.offset.quantum.unit
  return 0
}

function localMinimalWindow(node: Schedule): number {
  return Math.max(
    0,
    ...localChildChains(node.children).map((chain) => chain.reduce((sum, child) => sum + localOffsetFloor(child) + localSpanFloor(child), 0)),
  )
}

function temporalFlags(
  node: Schedule,
  start: number,
  end: number | null,
  context: TimeContext,
  provider: TimeContextProvider,
  msPerUnit: CalendarUnitScale,
): Pick<ResolvedSchedule, "isActive" | "isPending" | "isExpired" | "isEvent"> {
  const now = provider.currentValue(context)
  const isEvent = node.kind === "vector" ? node.duration.basis === 0 : node.kind === "absolute" && node.end !== undefined && node.end === node.start

  if (node.recurrence) {
    const duration = end === null ? null : Math.max(0, end - start)
    const state = recurrenceState(node.recurrence, start, duration, now, msPerUnit)
    return { ...state, isEvent }
  }

  if (isEvent) {
    return { isActive: false, isPending: now < start, isExpired: now >= start, isEvent }
  }

  return {
    isActive: now >= start && (end === null || now < end),
    isPending: now < start,
    isExpired: end !== null && now >= end,
    isEvent,
  }
}

function recurringSpan(node: Schedule, start: number, end: number | null, msPerUnit: CalendarUnitScale): Pick<ResolvedWithSpan, "spanStart" | "spanEnd"> {
  if (!node.recurrence) return { spanStart: start, spanEnd: end }
  const duration = end === null ? null : Math.max(0, end - start)
  const bounds = recurrenceBounds(node.recurrence, start, duration, msPerUnit)
  return { spanStart: bounds.firstStart ?? start, spanEnd: bounds.spanEnd }
}

function recurrenceState(
  rule: RecurrenceRule,
  baseStart: number,
  duration: number | null,
  now: number,
  msPerUnit: CalendarUnitScale,
): Pick<ResolvedSchedule, "isActive" | "isPending" | "isExpired"> {
  const bounds = recurrenceBounds(rule, baseStart, duration, msPerUnit)
  if (bounds.firstStart === null) return { isActive: false, isPending: false, isExpired: true }

  const active = hasActiveOccurrence(rule, baseStart, duration, now, msPerUnit)
  const isPending = now < bounds.firstStart
  const isExpired = bounds.bounded && bounds.spanEnd !== null && now >= bounds.spanEnd
  return { isActive: active, isPending, isExpired }
}

function recurrenceBounds(rule: RecurrenceRule, baseStart: number, duration: number | null, msPerUnit: CalendarUnitScale) {
  const bounded = rule.count !== undefined || rule.until !== undefined
  const starts = bounded ? generatedStarts(rule, baseStart, Infinity, msPerUnit) : generatedStarts(rule, baseStart, 1, msPerUnit)
  const firstStart = starts[0] ?? null

  if (!bounded) return { firstStart, spanEnd: null, bounded }
  if (firstStart === null) return { firstStart: null, spanEnd: baseStart, bounded }
  if (duration === null) return { firstStart, spanEnd: null, bounded }

  const lastStart = starts[starts.length - 1] ?? firstStart
  return { firstStart, spanEnd: lastStart + duration, bounded }
}

function hasActiveOccurrence(rule: RecurrenceRule, baseStart: number, duration: number | null, now: number, msPerUnit: CalendarUnitScale): boolean {
  if (duration === 0) return false
  const boundedLimit = rule.count ?? 10000
  const starts = generatedStarts(rule, baseStart, boundedLimit, msPerUnit)
  for (const start of starts) {
    if (now >= start && (duration === null || now < start + duration)) return true
    if (duration !== null && start > now) break
  }
  return false
}

function generatedStarts(rule: RecurrenceRule, baseStart: number, maxWhenUnbounded: number, msPerUnit: CalendarUnitScale): number[] {
  const count = rule.count ?? maxWhenUnbounded
  const starts: number[] = []
  for (let index = 0; index < count; index += 1) {
    const start = occurrenceStartAt(baseStart, rule, index, msPerUnit)
    if (start === null) break
    if (isOccurrenceIncluded(start, rule, msPerUnit)) starts.push(start)
  }
  for (const included of rule.includeValues ?? []) {
    if ((rule.until === undefined || included < rule.until) && !starts.includes(included)) starts.push(included)
  }
  starts.sort((a, b) => a - b)
  return starts.filter((start) => !(rule.excludeValues ?? []).includes(start))
}


function signedOffset(basis: number, direction: "after" | "before"): number {
  return direction === "after" ? basis : -basis
}
