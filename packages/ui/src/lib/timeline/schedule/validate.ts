// validate() — SCHEDULE-SPEC-v2.md §2.
// Contract is frozen: do not change the signature; types.ts is the authority.

import { alignmentCycles, alignmentDependencyId } from "./graph"
import type { DurationSpec, Offset, Schedule, TimeContext, ValidationError } from "./types"

const EPSILON = 1e-9

type Span = DurationSpec | Offset

/**
 * Statically check a tree against the seven §2 validity rules. Returns [] for a
 * valid tree. resolve/compress/trim reject trees with errors (spec: reject,
 * don't resolve).
 */
export function validate(schedule: Schedule): ValidationError[] {
  const errors: ValidationError[] = []

  if (schedule.kind !== "absolute") {
    errors.push({
      code: "root-not-absolute",
      nodeIds: [schedule.id],
      message: "The root schedule must be absolute.",
    })
  }

  checkDuplicateIds(schedule, errors)
  visit(schedule, schedule.kind === "absolute" ? schedule.timeContext : null, false, null, errors)
  return errors
}

function checkDuplicateIds(root: Schedule, errors: ValidationError[]) {
  const counts = new Map<string, number>()
  function collect(node: Schedule) {
    counts.set(node.id, (counts.get(node.id) ?? 0) + 1)
    for (const child of node.children) collect(child)
  }
  collect(root)
  for (const [id, count] of counts) {
    if (count > 1) {
      errors.push({
        code: "duplicate-node-id",
        nodeIds: [id],
        message: `Node id ${id} is used more than once.`,
      })
    }
  }
}

function visit(
  node: Schedule,
  nearestAbsoluteContext: TimeContext | null,
  hasRecurringAncestor: boolean,
  parent: Schedule | null,
  errors: ValidationError[],
) {
  const context = node.kind === "absolute" ? node.timeContext : nearestAbsoluteContext

  if (node.recurrence) {
    if (hasRecurringAncestor) {
      errors.push({
        code: "nested-recurrence",
        nodeIds: [node.id],
        message: "A recurring node may not have a recurring ancestor.",
      })
    }

    if (isCalendarFrequency(node.recurrence.frequency) && (!context || !isCalendarBearing(context))) {
      errors.push({
        code: "calendar-frequency-context",
        nodeIds: [node.id],
        message: `Recurrence frequency ${node.recurrence.frequency} requires a calendar-bearing time context.`,
      })
    }
  }

  if (node.kind === "vector") {
    checkSpan(node.id, "duration", node.duration, true, errors)
    checkSpan(node.id, "offset", node.offset, false, errors)

    if (node.alignment.kind === "endOfParent" && parent?.boundsMode === "auto") {
      errors.push({
        code: "end-of-parent-under-auto",
        nodeIds: [node.id],
        message: "A child may not align to endOfParent under an auto parent.",
      })
    }
  }

  checkSiblingGroup(node.children, errors)

  for (const child of node.children) {
    visit(child, context, hasRecurringAncestor || Boolean(node.recurrence), node, errors)
  }
}

function checkSiblingGroup(children: Schedule[], errors: ValidationError[]) {
  const ids = new Set(children.map((child) => child.id))

  for (const child of children) {
    const depId = alignmentDependencyId(child)
    if (depId && (!ids.has(depId) || depId === child.id)) {
      errors.push({
        code: "sibling-target-missing",
        nodeIds: [child.id],
        message: `Alignment target ${depId} is not a sibling of ${child.id}.`,
      })
    }
  }

  for (const cycle of alignmentCycles(children)) {
    errors.push({
      code: "alignment-cycle",
      nodeIds: cycle,
      message: `Alignment references form a cycle: ${cycle.join(" -> ")}.`,
    })
  }
}

function checkSpan(nodeId: string, label: "duration" | "offset", span: Span, isDuration: boolean, errors: ValidationError[]) {
  const sanity =
    span.basis < 0 ||
    span.flex < 0 ||
    (span.min !== undefined && span.min > span.basis) ||
    (span.max !== undefined && span.basis > span.max) ||
    (span.quantum !== undefined && span.quantum.unit <= 0) ||
    (isDuration &&
      span.basis === 0 &&
      (span.min !== undefined || span.max !== undefined || span.flex !== 0 || span.quantum !== undefined))

  if (sanity) {
    errors.push({
      code: "constraint-sanity",
      nodeIds: [nodeId],
      message: `Invalid ${label} constraints on ${nodeId}.`,
    })
  }

  const unit = span.quantum?.unit
  if (
    unit !== undefined &&
    unit > 0 &&
    ![span.basis, span.min, span.max].every((value) => value === undefined || isMultiple(value, unit))
  ) {
    errors.push({
      code: "off-quantum-value",
      nodeIds: [nodeId],
      message: `${label} carries authored values that are not multiples of quantum.unit=${unit}.`,
    })
  }
}

function isMultiple(value: number, unit: number): boolean {
  const quotient = value / unit
  return Math.abs(quotient - Math.round(quotient)) <= EPSILON
}

function isCalendarFrequency(frequency: string): boolean {
  return frequency === "hourly" || frequency === "daily" || frequency === "weekly" || frequency === "monthly"
}

function isCalendarBearing(context: TimeContext): boolean {
  return context.kind === "wallClock" || (context.kind === "custom" && context.calendarBearing === true)
}
