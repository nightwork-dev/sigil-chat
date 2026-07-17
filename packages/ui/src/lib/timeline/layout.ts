// Greedy interval-scheduling lane-packing — the one algorithm in the source's
// timeline system that was genuinely correct and load-bearing (confirmed
// via an architecture survey: sort events by start time, and for each one
// reuse the first lane whose previous event has already ended, otherwise
// open a new lane). Ported as-is; everything else in that codebase's
// scaling/layout module (lib/timeline/scaling.ts) turned out to be dead
// code with zero call sites, so it wasn't carried over.
//
// Fixed one real inconsistency from the source: its lane-height constant
// (40, used by the layout math's own getLaneYPosition/calculateTimelineHeight
// helpers) never matched the *rendering* component, which hardcoded 48
// inline instead of calling those helpers — two magic numbers for the same
// concept that happened not to visibly conflict only because the shared
// helpers were never actually called. Here there is exactly one constant,
// and the rendering component is expected to call getLaneYPosition instead
// of re-deriving it.

import { eventTimeRange, type TimelineEvent } from "@workspace/ui/lib/timeline/types"

export interface LayoutEvent {
  event: TimelineEvent
  lane: number
  startTime: number
  endTime: number
}

export const LANE_HEIGHT = 40
export const LANE_GAP = 8
const MAX_TIMELINE_HEIGHT = 600

// An instantaneous event's true time range is zero-width ([t, t]), which
// meant a range event starting at exactly that same instant read as merely
// "adjacent, not overlapping" under a strict `laneEnd <= start` check —
// they'd pack into the same lane and their labels would render on top of
// each other. Instantaneous events get a small synthetic footprint for
// this collision check only (LayoutEvent.startTime/endTime below still
// report the true zero-width range for rendering position).
const INSTANTANEOUS_LABEL_FOOTPRINT_MS = 30 * 60 * 1000

function packingTimeRange(event: TimelineEvent): [number, number] {
  const [start, end] = eventTimeRange(event)
  return event.type === "instantaneous" ? [start, end + INSTANTANEOUS_LABEL_FOOTPRINT_MS] : [start, end]
}

export function calculateEventLayout(events: TimelineEvent[]): LayoutEvent[] {
  const sorted = [...events].sort((a, b) => packingTimeRange(a)[0] - packingTimeRange(b)[0])
  const laneEndTimes: number[] = []
  const result: LayoutEvent[] = []

  for (const event of sorted) {
    const [trueStart, trueEnd] = eventTimeRange(event)
    const [packStart, packEnd] = packingTimeRange(event)
    let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= packStart)
    if (lane === -1) {
      lane = laneEndTimes.length
      laneEndTimes.push(packEnd)
    } else {
      laneEndTimes[lane] = packEnd
    }
    result.push({ event, lane, startTime: trueStart, endTime: trueEnd })
  }

  return result
}

export function getLaneYPosition(lane: number): number {
  return LANE_GAP + lane * (LANE_HEIGHT + LANE_GAP)
}

export function calculateTimelineHeight(layoutEvents: LayoutEvent[]): number {
  const maxLane = layoutEvents.reduce((max, e) => Math.max(max, e.lane), -1)
  return Math.min((maxLane + 1) * (LANE_HEIGHT + LANE_GAP) + LANE_GAP, MAX_TIMELINE_HEIGHT)
}
