// Pure types for the timeline/gantt system. Scoped down from the source's
// three-way event union (instantaneous/range/relative) to two — an
// architecture survey found "relative" (position defined as an offset from
// another event's start/end) was never actually wired correctly there:
// the one component that resolves a relative event's absolute position
// defaults its parent-start/parent-end props to 0 (since the container
// never passes them), so every relative event rendered near the Unix
// epoch; separately, the layout/collision code treated relative events as
// "instantaneous at Date.now()" instead. Two different, both-wrong
// resolutions of the same concept, and no demo in that codebase ever
// exercised it. The idea (derived sub-events) is worth keeping for a
// future pass, but there's no working implementation to port — building
// it now would mean inventing the whole feature from scratch inside an
// already-large port, so it's deferred rather than shipped half-broken.

export interface TimelineEventBase {
  id: string
  title: string
  description?: string
  /** CSS color value (e.g. a theme token) — defaults to the primary signal color if omitted. */
  color?: string
}

export interface InstantaneousEvent extends TimelineEventBase {
  type: "instantaneous"
  /** Unix ms. */
  timestamp: number
}

export interface RangeEvent extends TimelineEventBase {
  type: "range"
  /** Unix ms. */
  startTime: number
  /** Unix ms. */
  endTime: number
}

export type TimelineEvent = InstantaneousEvent | RangeEvent

export function eventTimeRange(event: TimelineEvent): [number, number] {
  return event.type === "instantaneous" ? [event.timestamp, event.timestamp] : [event.startTime, event.endTime]
}

/** Parent → children adjacency for the dependency-arrow overlay. Does not affect scheduling — linking a parent doesn't move the child. */
export interface TimelineRelationship {
  parentId?: string
  childIds: string[]
}
