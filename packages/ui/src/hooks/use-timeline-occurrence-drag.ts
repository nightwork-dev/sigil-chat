// Shadow-occurrence interaction machine (TIMELINE-UI-AFFORDANCES.md §4.4, §5.2).
//
// A recurring series' non-focused occurrences render as shadow echo bars (§5.2).
// They carry three gestures the focused-bar drag hook doesn't:
//   - Cmd/Ctrl-drag → override THIS occurrence live (writes an absolute start),
//     detaching it from the series pattern the moment the gesture starts (§4.4).
//   - plain drag → on drop, ask once "this occurrence only / the whole series"
//     (the caller renders the choice; the modifier is the no-prompt fast path).
//   - click (no meaningful travel) → re-center the view on that occurrence (§5.2).
//
// Snapping obeys the same precedence as the focused bar (§1.1): a recurring
// absolute node has no quantum, so the ambient grid applies (Alt bypasses it).

import { useEffect, useRef, useState } from "react"
import { snapTime } from "@workspace/ui/hooks/use-timeline-event-drag"
import type { createTimeScale } from "@workspace/ui/lib/timeline/scale"

/** A single occurrence identified for a gesture. */
export interface OccurrenceRef {
  nodeId: string
  occurrenceIndex: number
  /** The occurrence's current resolved start — the snap anchor. */
  start: number
}

/** A plain-drag drop awaiting the this-vs-series choice (§4.4). */
export interface PendingOccurrenceMove extends OccurrenceRef {
  /** Where the drop landed (absolute, snapped). */
  targetStart: number
  /** Screen position of the drop, for placing the choice popover. */
  clientX: number
  clientY: number
}

export interface UseTimelineOccurrenceDragOptions {
  scale: ReturnType<typeof createTimeScale>
  ambientMs: number
  /** Live Cmd-drag: override this occurrence to an absolute start (§4.4). */
  onOverrideMove: (nodeId: string, occurrenceIndex: number, startMs: number) => void
  /** Plain-drag drop past the click threshold — the caller prompts, then resolves. */
  onPlainDrop: (pending: PendingOccurrenceMove) => void
  /** Click (no meaningful travel) — re-center the view on this occurrence (§5.2). */
  onClick: (ref: OccurrenceRef) => void
  onDragStart?: (nodeId: string) => void
  onDragEnd?: () => void
}

interface OccurrenceDragRef extends OccurrenceRef {
  startClientX: number
  startClientY: number
  override: boolean
  ambientMs: number
  lastTargetTime: number
  movedPastThreshold: boolean
}

/** Pixels of travel below which a gesture is a click, not a drag. */
const CLICK_THRESHOLD_PX = 4

export function useTimelineOccurrenceDrag({ scale, ambientMs, onOverrideMove, onPlainDrop, onClick, onDragStart, onDragEnd }: UseTimelineOccurrenceDragOptions) {
  const dragRef = useRef<OccurrenceDragRef | null>(null)
  const [overridingKey, setOverridingKey] = useState<string | null>(null)

  function handleOccurrenceMouseDown(e: React.MouseEvent, ref: OccurrenceRef) {
    e.stopPropagation()
    const override = e.metaKey || e.ctrlKey
    dragRef.current = {
      ...ref,
      startClientX: e.clientX,
      startClientY: e.clientY,
      override,
      ambientMs,
      lastTargetTime: ref.start,
      movedPastThreshold: false,
    }
    if (override) {
      setOverridingKey(`${ref.nodeId}:${ref.occurrenceIndex}`)
      onDragStart?.(ref.nodeId)
    }
  }

  useEffect(() => {
    function targetFor(drag: OccurrenceDragRef, clientX: number, altKey: boolean): number {
      const deltaX = clientX - drag.startClientX
      const msPerPixel = (scale.domain()[1].getTime() - scale.domain()[0].getTime()) / (scale.range()[1] - scale.range()[0])
      return snapTime(drag.start + deltaX * msPerPixel, { ambientMs: drag.ambientMs, bypassAmbient: altKey })
    }

    function handleMouseMove(e: MouseEvent) {
      const drag = dragRef.current
      if (!drag) return
      if (!drag.movedPastThreshold && Math.abs(e.clientX - drag.startClientX) < CLICK_THRESHOLD_PX && Math.abs(e.clientY - drag.startClientY) < CLICK_THRESHOLD_PX) {
        return
      }
      drag.movedPastThreshold = true
      if (!drag.override) return // plain drag resolves on drop, not per-frame
      const target = targetFor(drag, e.clientX, e.altKey)
      if (target === drag.lastTargetTime) return
      drag.lastTargetTime = target
      onOverrideMove(drag.nodeId, drag.occurrenceIndex, target)
    }

    function handleMouseUp(e: MouseEvent) {
      const drag = dragRef.current
      dragRef.current = null
      setOverridingKey(null)
      if (!drag) return
      if (!drag.movedPastThreshold) {
        onClick({ nodeId: drag.nodeId, occurrenceIndex: drag.occurrenceIndex, start: drag.start })
      } else if (drag.override) {
        onDragEnd?.()
      } else {
        onPlainDrop({
          nodeId: drag.nodeId,
          occurrenceIndex: drag.occurrenceIndex,
          start: drag.start,
          targetStart: targetFor(drag, e.clientX, e.altKey),
          clientX: e.clientX,
          clientY: e.clientY,
        })
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [scale, onOverrideMove, onPlainDrop, onClick, onDragEnd])

  return { handleOccurrenceMouseDown, overridingKey }
}
