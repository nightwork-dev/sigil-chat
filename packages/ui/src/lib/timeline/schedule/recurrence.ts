import type { RecurrenceRule, TimeContext } from "./types"

export interface OccurrenceStart {
  index: number
  start: number
  included: boolean
  synthetic: boolean
}

export type CalendarUnitScale = 1 | 1000

const SECOND_MS = 1000
const HOUR_MS = 60 * 60 * SECOND_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

export function calendarUnitScaleForContext(context: TimeContext): CalendarUnitScale {
  return context.kind === "wallClock" && context.unit === "milliseconds" ? 1 : 1000
}

function asUtcDate(value: number, msPerUnit: CalendarUnitScale): Date {
  return new Date(value * msPerUnit)
}

function calendarSpan(ms: number, msPerUnit: CalendarUnitScale): number {
  return ms / msPerUnit
}

function daysInUtcMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate()
}

export function addUtcMonthsClamped(baseStart: number, months: number, msPerUnit: CalendarUnitScale): number {
  const d = asUtcDate(baseStart, msPerUnit)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  const hour = d.getUTCHours()
  const minute = d.getUTCMinutes()
  const second = d.getUTCSeconds()
  const ms = d.getUTCMilliseconds()
  const targetMonth = m + months
  const first = new Date(Date.UTC(y, targetMonth, 1, hour, minute, second, ms))
  const clampedDay = Math.min(day, daysInUtcMonth(first.getUTCFullYear(), first.getUTCMonth()))
  return Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), clampedDay, hour, minute, second, ms) / msPerUnit
}

export function occurrenceStartAt(
  baseStart: number,
  recurrence: RecurrenceRule | undefined,
  index: number,
  msPerUnit: CalendarUnitScale,
): number | null {
  if (index < 0 || !Number.isInteger(index)) return null
  if (!recurrence) return index === 0 ? baseStart : null
  const interval = recurrence.interval ?? 1
  if (recurrence.count !== undefined && index >= recurrence.count) return null

  let start: number
  switch (recurrence.frequency) {
    case "hourly":
      start = baseStart + index * calendarSpan(HOUR_MS, msPerUnit) * interval
      break
    case "daily":
      start = baseStart + index * calendarSpan(DAY_MS, msPerUnit) * interval
      break
    case "weekly":
      start = baseStart + index * calendarSpan(WEEK_MS, msPerUnit) * interval
      break
    case "monthly":
      start = addUtcMonthsClamped(baseStart, index * interval, msPerUnit)
      break
    case "custom":
      start = baseStart + index * interval * (recurrence.customInterval ?? 1)
      break
  }

  if (recurrence.until !== undefined && start >= recurrence.until) return null
  return start
}

export function isOccurrenceIncluded(start: number, recurrence: RecurrenceRule | undefined, msPerUnit: CalendarUnitScale): boolean {
  if (!recurrence) return true
  if (recurrence.excludeValues?.includes(start)) return false
  if ((recurrence.frequency === "daily" || recurrence.frequency === "weekly") && recurrence.daysOfWeek?.length) {
    const day = asUtcDate(start, msPerUnit).getUTCDay()
    if (!recurrence.daysOfWeek.includes(day)) return false
  }
  if (recurrence.frequency === "monthly" && recurrence.daysOfMonth?.length) {
    const day = asUtcDate(start, msPerUnit).getUTCDate()
    if (!recurrence.daysOfMonth.includes(day)) return false
  }
  return true
}

export function generatedOccurrencesUntil(
  baseStart: number,
  recurrence: RecurrenceRule | undefined,
  stop: (start: number, index: number) => boolean,
  msPerUnit: CalendarUnitScale,
  maxIterations = 10000,
): OccurrenceStart[] {
  if (!recurrence) {
    return stop(baseStart, 0) ? [] : [{ index: 0, start: baseStart, included: true, synthetic: false }]
  }

  const out: OccurrenceStart[] = []
  for (let index = 0; index < maxIterations; index++) {
    const start = occurrenceStartAt(baseStart, recurrence, index, msPerUnit)
    if (start === null) break
    if (stop(start, index)) break
    out.push({ index, start, included: isOccurrenceIncluded(start, recurrence, msPerUnit), synthetic: false })
  }
  return out
}

export function includedIncludeValues(baseStart: number, recurrence: RecurrenceRule | undefined): OccurrenceStart[] {
  if (!recurrence?.includeValues?.length) return []
  return [...recurrence.includeValues]
    .sort((a, b) => a - b)
    .map((start, offset) => ({ index: Number.MAX_SAFE_INTEGER - recurrence.includeValues!.length + offset + 1, start, included: true, synthetic: true }))
    .filter((o) => o.start >= baseStart || true)
}
