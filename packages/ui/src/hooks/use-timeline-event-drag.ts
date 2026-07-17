// The Canvas's drag-to-move/resize state machine, extracted out of the
// render component per this repo's convention: imperative window-listener
// work belongs in a named hook, not inline in a component body.
//
// Snapping (UI spec §1) is applied to the *absolute target* of the dragged
// edge, not to the per-frame increment — the delta each frame is `snapped
// target − last snapped target`, so the edge lands on grid multiples rather
// than accumulating rounding drift. Precedence, non-negotiable:
//   1. the node's own quantum (vector duration/offset grid) — always wins,
//      Alt cannot bypass it;
//   2. the ambient zoom-derived grid — applies when the node has no quantum;
//   3. Alt/Option — disables the ambient grid only (never a node quantum).
// The store's structural clamp (§1.3) is the last line of defense underneath.

import { useEffect, useRef, useState } from "react"
import type { DragMode } from "@workspace/ui/lib/timeline/store"
import type { LayoutEvent } from "@workspace/ui/lib/timeline/layout"
import type { createTimeScale } from "@workspace/ui/lib/timeline/scale"

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/**
 * Ambient snap grid (§1.2), one step finer than the visible date-tick labels
 * and bracketed by zoom the way production Gantt tools are: 15-minute at day-zoom,
 * hourly at week-zoom, daily at month-zoom, weekly beyond. Derived from the
 * view span rather than fixed constants so it tracks the same zoom math the
 * tick density uses.
 */
export function ambientGridMs(viewSpanMs: number): number {
  if (viewSpanMs <= 3 * DAY) return 15 * MINUTE
  if (viewSpanMs <= 21 * DAY) return HOUR
  if (viewSpanMs <= 120 * DAY) return DAY
  return 7 * DAY
}

export interface SnapOptions {
  /** §1.1(1): the node's own quantum. When present it wins and Alt cannot bypass it. */
  nodeQuantumMs?: number
  /** §1.1(2): the ambient zoom-derived grid. */
  ambientMs: number
  /** §1.1(3): Alt/Option — bypasses the ambient grid only. */
  bypassAmbient: boolean
}

/** Round an absolute time to the highest-precedence active grid (§1.1). */
export function snapTime(rawMs: number, { nodeQuantumMs, ambientMs, bypassAmbient }: SnapOptions): number {
  if (nodeQuantumMs && nodeQuantumMs > 0) return Math.round(rawMs / nodeQuantumMs) * nodeQuantumMs
  if (bypassAmbient || !ambientMs || ambientMs <= 0) return rawMs
  return Math.round(rawMs / ambientMs) * ambientMs
}

export interface GhostRect {
  start: number
  end: number
}

/**
 * The translucent extension a derived parent grows during a child drag (§3.1):
 * wherever the parent's live-resolved window now reaches past where it sat at
 * gesture start, that delta is the ghost edge. Returns 0, 1, or 2 rects (a
 * child can push both the start earlier and the end later).
 */
export function ghostExtensions(current: GhostRect | undefined, baseline: GhostRect | undefined): GhostRect[] {
  if (!current || !baseline) return []
  const rects: GhostRect[] = []
  if (current.start < baseline.start) rects.push({ start: current.start, end: baseline.start })
  if (current.end > baseline.end) rects.push({ start: baseline.end, end: current.end })
  return rects
}

interface DragRef {
  eventId: string
  mode: DragMode
  startClientX: number
  startClientY: number
  /** Absolute time of the dragged edge at gesture start — snap anchor. */
  anchorTime: number
  /** The last snapped target already applied to the store, so the next frame sends only the difference. */
  lastTargetTime: number
  ambientMs: number
  nodeQuantumMs: number | undefined
  linkMode: boolean
  linkTargetId: string | null
  /**
   * Cmd/Ctrl held at gesture start on a recurring node's focused bar (§4.4):
   * the move overrides occurrence 0 alone (writes an absolute start) instead of
   * shifting the whole series. Decided once at mousedown — the modifier can't be
   * toggled mid-gesture into a different meaning.
   */
  overrideMode: boolean
}

export interface UseTimelineEventDragOptions {
  scale: ReturnType<typeof createTimeScale>
  /** Ambient grid granularity for this zoom level (§1.2), captured at gesture start. */
  ambientMs: number
  /** The dragged node's own snapping quantum, if any (§1.1(1)). */
  nodeQuantumMs?: (id: string) => number | undefined
  /** Whether a node is a recurring series (enables Cmd-drag occurrence override, §4.4). */
  isRecurring?: (id: string) => boolean
  onDragStart: (id: string) => void
  onDragEnd?: () => void
  onMove: (id: string, deltaMs: number) => void
  onResize: (id: string, edge: "start" | "end", deltaMs: number) => void
  onLink: (childId: string, parentId: string) => void
  /** Cmd-drag on a recurring focused bar: move occurrence 0 alone to an absolute start (§4.4). */
  onOverrideMove?: (id: string, startMs: number) => void
}

/** The absolute time of the edge a given gesture drags. */
function anchorTimeFor(event: LayoutEvent["event"], mode: DragMode): number {
  if (event.type === "instantaneous") return event.timestamp
  return mode === "resize-end" ? event.endTime : event.startTime
}

export function useTimelineEventDrag({ scale, ambientMs, nodeQuantumMs, isRecurring, onDragStart, onDragEnd, onMove, onResize, onLink, onOverrideMove }: UseTimelineEventDragOptions) {
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overrideActive, setOverrideActive] = useState(false)
  const dragRef = useRef<DragRef | null>(null)

  function handleEventMouseDown(e: React.MouseEvent, layoutEvent: LayoutEvent, mode: DragMode) {
    e.stopPropagation()
    const id = layoutEvent.event.id
    onDragStart(id)
    const anchorTime = anchorTimeFor(layoutEvent.event, mode)
    const overrideMode = mode === "move" && (e.metaKey || e.ctrlKey) && !!isRecurring?.(id) && !!onOverrideMove
    dragRef.current = {
      eventId: id,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      anchorTime,
      lastTargetTime: anchorTime,
      ambientMs,
      nodeQuantumMs: nodeQuantumMs?.(id),
      linkMode: false,
      linkTargetId: null,
      overrideMode,
    }
    setDraggingId(id)
    if (overrideMode) setOverrideActive(true)
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const drag = dragRef.current
      if (!drag) return
      const deltaX = e.clientX - drag.startClientX
      const deltaY = e.clientY - drag.startClientY

      // Gesture overload, ported from the source: dragging mostly
      // vertically (not horizontally) switches from "reschedule this
      // event" to "link it as a child of whatever's under the cursor" —
      // one gesture, two outcomes, decided by which axis dominates.
      if (drag.mode === "move" && Math.abs(deltaY) > 30 && Math.abs(deltaX) < 100) {
        drag.linkMode = true
        const targetEl = document.elementFromPoint(e.clientX, e.clientY)
        const targetId = targetEl?.closest("[data-timeline-event-id]")?.getAttribute("data-timeline-event-id")
        const target = targetId && targetId !== drag.eventId ? targetId : null
        drag.linkTargetId = target
        setLinkTargetId(target)
        return
      }

      if (drag.linkMode) return // committed to link mode for this gesture once triggered

      // Snap the dragged edge's ABSOLUTE target (anchor + cumulative cursor
      // travel), then send only the difference from the last applied target.
      // onMove/onResize add relatively to the store's current position, so the
      // running sum of these differences keeps the edge pinned to grid; if the
      // store clamps (§1.3), the intended target still tracks the cursor and
      // recovers cleanly when the drag reverses.
      const msPerPixel = (scale.domain()[1].getTime() - scale.domain()[0].getTime()) / (scale.range()[1] - scale.range()[0])
      const rawTarget = drag.anchorTime + deltaX * msPerPixel
      const target = snapTime(rawTarget, { nodeQuantumMs: drag.nodeQuantumMs, ambientMs: drag.ambientMs, bypassAmbient: e.altKey })

      // Cmd-drag on a recurring focused bar overrides occurrence 0 to an
      // absolute start (§4.4) — an absolute write, not a relative accumulation,
      // so it detaches cleanly from the series pattern.
      if (drag.overrideMode) {
        if (target === drag.lastTargetTime) return
        drag.lastTargetTime = target
        onOverrideMove?.(drag.eventId, target)
        return
      }

      const incrementalDeltaMs = target - drag.lastTargetTime
      if (incrementalDeltaMs === 0) return
      drag.lastTargetTime = target

      if (drag.mode === "move") onMove(drag.eventId, incrementalDeltaMs)
      else onResize(drag.eventId, drag.mode === "resize-start" ? "start" : "end", incrementalDeltaMs)
    }

    function handleMouseUp() {
      const drag = dragRef.current
      if (drag?.linkMode && drag.linkTargetId) onLink(drag.eventId, drag.linkTargetId)
      dragRef.current = null
      setLinkTargetId(null)
      setDraggingId(null)
      setOverrideActive(false)
      onDragEnd?.()
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [scale, onMove, onResize, onLink, onOverrideMove, onDragEnd])

  return { handleEventMouseDown, linkTargetId, draggingId, overrideActive }
}
