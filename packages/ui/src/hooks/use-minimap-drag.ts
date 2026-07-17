// The Minimap's pan/resize-handle state machine, extracted out of the
// render component per this repo's convention: imperative window-listener
// work belongs in a named hook, not inline in a component body.

import { useEffect, useRef } from "react"

type MinimapDragMode = "pan" | "resize-start" | "resize-end"

interface MinimapDragRef {
  mode: MinimapDragMode
  startClientX: number
  startViewStart: number
  startViewEnd: number
}

export interface UseMinimapDragOptions {
  overallStart: number
  overallEnd: number
  width: number
  viewStart: number
  viewEnd: number
  onViewChange: (start: number, end: number) => void
}

const MIN_VIEW_DURATION_MS = 60_000

export function useMinimapDrag({ overallStart, overallEnd, width, viewStart, viewEnd, onViewChange }: UseMinimapDragOptions) {
  const dragRef = useRef<MinimapDragRef | null>(null)

  function startDrag(mode: MinimapDragMode, clientX: number) {
    dragRef.current = { mode, startClientX: clientX, startViewStart: viewStart, startViewEnd: viewEnd }
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const drag = dragRef.current
      if (!drag) return
      const msPerPixel = (overallEnd - overallStart) / (width || 1)
      const deltaMs = (e.clientX - drag.startClientX) * msPerPixel
      if (drag.mode === "pan") onViewChange(drag.startViewStart + deltaMs, drag.startViewEnd + deltaMs)
      else if (drag.mode === "resize-start") onViewChange(Math.min(drag.startViewStart + deltaMs, drag.startViewEnd - MIN_VIEW_DURATION_MS), drag.startViewEnd)
      else onViewChange(drag.startViewStart, Math.max(drag.startViewEnd + deltaMs, drag.startViewStart + MIN_VIEW_DURATION_MS))
    }
    function handleMouseUp() {
      dragRef.current = null
    }
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [overallStart, overallEnd, width, onViewChange])

  return { startDrag }
}
