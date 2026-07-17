// Schedule engine — public surface. Pure TS, zero React.
// SCHEDULE-SPEC-v2.md v0.3 is normative; the conformance corpus under
// ../conformance/fixtures is the enforcement mechanism (spec §12).

export * as scheduleTypes from "./types"
export type {
  Schedule,
  AbsoluteSchedule,
  VectorSchedule,
  Alignment,
  Direction,
  Offset,
  DurationSpec,
  Quantum,
  QuantumMode,
  BoundsMode,
  RecurrenceRule,
  Frequency,
  SchedulePayload,
  TimeContext,
  TimeContextProvider,
  ResolvedSchedule,
  Provenance,
  BoundsStatus,
  ConflictInfo,
  Edge,
  OccurrenceOverride,
  OccurrenceOverrides,
  ResolvedInstance,
  ValidationError,
  ValidationCode,
  CompressResult,
  NodeAdjustment,
  TrimPolicy,
  MaterializeOp,
  JSONValue,
} from "./types"
export { overrideKey } from "./types"
export { normalizeDuration, normalizeOffset, normalizeSchedule, ZERO_OFFSET } from "./normalize"
export { validate } from "./validate"
export { resolve } from "./resolve"
export { compress, trim, materialize, minimalWindow, maximalWindow } from "./operators"
export { instancesOf, occurrenceAt, pastInstancesOf, activeInstance } from "./occurrences"
