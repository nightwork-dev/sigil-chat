// Occurrence accessors — SCHEDULE-SPEC-v2.md §5.2–5.3.

import { resolve } from "./resolve"
import {
  calendarUnitScaleForContext,
  generatedOccurrencesUntil,
  includedIncludeValues,
  isOccurrenceIncluded,
  occurrenceStartAt,
  type CalendarUnitScale,
} from "./recurrence"
import { overrideKey, type OccurrenceOverrides, type ResolvedInstance, type ResolvedSchedule, type Schedule, type TimeContextProvider } from "./types"

const EMPTY: OccurrenceOverrides = new Map()
const MAX_SCAN = 10000

function durationOf(resolved: ResolvedSchedule): number | null {
  return resolved.resolvedEnd === null ? null : resolved.resolvedEnd - resolved.resolvedStart
}

function intersects(start: number, end: number | null, rangeStart: number, rangeEnd: number): boolean {
  const effectiveEnd = end ?? start
  return start < rangeEnd && (end === null ? start >= rangeStart : effectiveEnd > rangeStart)
}

function before(end: number | null, start: number, value: number): boolean {
  return (end ?? start) < value
}

function translateResolved(node: ResolvedSchedule, delta: number): ResolvedSchedule {
  return {
    ...node,
    resolvedStart: node.resolvedStart + delta,
    resolvedEnd: node.resolvedEnd === null ? null : node.resolvedEnd + delta,
    children: node.children.map((child) => translateResolved(child, delta)),
  }
}

function applyRootOverride(subtree: ResolvedSchedule, start: number, end: number | null): ResolvedSchedule {
  return { ...subtree, resolvedStart: start, resolvedEnd: end }
}

function makeInstance(
  schedule: Schedule,
  base: ResolvedSchedule,
  occurrenceIndex: number,
  occurrenceStart: number,
  overrides: OccurrenceOverrides,
): ResolvedInstance {
  const key = overrideKey(schedule.id, occurrenceIndex)
  const override = overrides.get(key)
  const baseDuration = durationOf(base)
  const movedStart = override?.start ?? occurrenceStart
  const movedDuration = override?.duration ?? baseDuration
  const movedEnd = movedDuration === null ? null : movedStart + movedDuration
  const delta = movedStart - base.resolvedStart
  const translated = translateResolved(base, delta)
  return {
    scheduleId: schedule.id,
    occurrenceIndex,
    resolvedStart: movedStart,
    resolvedEnd: movedEnd,
    isModified: override !== undefined,
    cancelled: override?.cancelled ?? false,
    subtree: applyRootOverride(translated, movedStart, movedEnd),
  }
}

function findRecurringSchedule(node: Schedule): Schedule {
  if (node.recurrence) return node
  for (const child of node.children) {
    const found = findRecurringSchedule(child)
    if (found.recurrence) return found
  }
  return node
}

function findResolved(node: ResolvedSchedule, id: string): ResolvedSchedule | null {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findResolved(child, id)
    if (found) return found
  }
  return null
}

function recurrenceScaleForTree(schedule: Schedule): CalendarUnitScale {
  if (schedule.kind !== "absolute") throw new Error("Invalid schedule: root-not-absolute")
  return calendarUnitScaleForContext(schedule.timeContext)
}

function occurrenceTarget(schedule: Schedule, provider: TimeContextProvider): { schedule: Schedule; base: ResolvedSchedule; msPerUnit: CalendarUnitScale } {
  const root = resolve(schedule, provider)
  const target = findRecurringSchedule(schedule)
  return { schedule: target, base: findResolved(root, target.id) ?? root, msPerUnit: recurrenceScaleForTree(schedule) }
}

function generatedIndexAfter(ruleCount: number | undefined, generatedLength: number): number {
  return ruleCount ?? generatedLength
}

export function instancesOf(
  schedule: Schedule,
  provider: TimeContextProvider,
  rangeStart: number,
  rangeEnd: number,
  overrides: OccurrenceOverrides = EMPTY,
): ResolvedInstance[] {
  const target = occurrenceTarget(schedule, provider)
  const baseDuration = durationOf(target.base) ?? 0

  if (!target.schedule.recurrence) {
    const inst = makeInstance(target.schedule, target.base, 0, target.base.resolvedStart, overrides)
    return intersects(inst.resolvedStart, inst.resolvedEnd, rangeStart, rangeEnd) ? [inst] : []
  }

  const generated = generatedOccurrencesUntil(
    target.base.resolvedStart,
    target.schedule.recurrence,
    (start) => start >= rangeEnd && start - baseDuration > rangeEnd,
    target.msPerUnit,
    MAX_SCAN,
  )

  const out: ResolvedInstance[] = []
  for (const occ of generated) {
    if (!occ.included) continue
    const inst = makeInstance(target.schedule, target.base, occ.index, occ.start, overrides)
    if (intersects(inst.resolvedStart, inst.resolvedEnd, rangeStart, rangeEnd)) out.push(inst)
  }

  const includeBase = generatedIndexAfter(target.schedule.recurrence.count, generated.length)
  for (const [offset, occ] of includedIncludeValues(target.base.resolvedStart, target.schedule.recurrence).entries()) {
    const inst = makeInstance(target.schedule, target.base, includeBase + offset, occ.start, overrides)
    if (intersects(inst.resolvedStart, inst.resolvedEnd, rangeStart, rangeEnd)) out.push(inst)
  }

  return out.sort((a, b) => a.resolvedStart - b.resolvedStart || a.occurrenceIndex - b.occurrenceIndex)
}

export function occurrenceAt(
  schedule: Schedule,
  provider: TimeContextProvider,
  index: number,
  overrides: OccurrenceOverrides = EMPTY,
): ResolvedInstance | null {
  const target = occurrenceTarget(schedule, provider)
  if (!target.schedule.recurrence) {
    return index === 0 ? makeInstance(target.schedule, target.base, 0, target.base.resolvedStart, overrides) : null
  }

  const start = occurrenceStartAt(target.base.resolvedStart, target.schedule.recurrence, index, target.msPerUnit)
  if (start === null) return null
  if (!isOccurrenceIncluded(start, target.schedule.recurrence, target.msPerUnit)) return null
  const inst = makeInstance(target.schedule, target.base, index, start, overrides)
  return inst.cancelled ? null : inst
}

export function pastInstancesOf(
  schedule: Schedule,
  provider: TimeContextProvider,
  beforeValue: number,
  overrides: OccurrenceOverrides = EMPTY,
): ResolvedInstance[] {
  const target = occurrenceTarget(schedule, provider)
  const baseDuration = durationOf(target.base) ?? 0
  if (!target.schedule.recurrence) {
    const inst = makeInstance(target.schedule, target.base, 0, target.base.resolvedStart, overrides)
    return before(inst.resolvedEnd, inst.resolvedStart, beforeValue) ? [inst] : []
  }

  const generated = generatedOccurrencesUntil(
    target.base.resolvedStart,
    target.schedule.recurrence,
    (start) => start - baseDuration > beforeValue,
    target.msPerUnit,
    MAX_SCAN,
  )
  return generated
    .filter((occ) => occ.included)
    .map((occ) => makeInstance(target.schedule, target.base, occ.index, occ.start, overrides))
    .filter((inst) => before(inst.resolvedEnd, inst.resolvedStart, beforeValue))
    .sort((a, b) => a.resolvedStart - b.resolvedStart || a.occurrenceIndex - b.occurrenceIndex)
}

export function activeInstance(
  schedule: Schedule,
  provider: TimeContextProvider,
  now: number,
  overrides: OccurrenceOverrides = EMPTY,
): ResolvedInstance | null {
  const target = occurrenceTarget(schedule, provider)
  const baseDuration = durationOf(target.base)

  if (!target.schedule.recurrence) {
    const inst = makeInstance(target.schedule, target.base, 0, target.base.resolvedStart, overrides)
    if (inst.resolvedEnd === null) return inst.resolvedStart === now ? inst : null
    return inst.resolvedStart <= now && now < inst.resolvedEnd ? inst : null
  }

  const rangeStart = baseDuration === null ? target.base.resolvedStart : now - Math.max(baseDuration, 0)
  const candidates = instancesOf(schedule, provider, rangeStart, now + 1, overrides)
  return (
    candidates.find((inst) => {
      if (inst.cancelled) return false
      if (inst.resolvedEnd === null) return inst.resolvedStart === now
      if (inst.resolvedStart === inst.resolvedEnd) return inst.resolvedStart === now
      return inst.resolvedStart <= now && now < inst.resolvedEnd
    }) ?? null
  )
}
