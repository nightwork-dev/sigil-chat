// Wheel/trackpad pan+zoom, ported from the source's use-scroll.ts — the
// zoom-to-cursor math there was genuinely correct: keep the point under the
// cursor stationary while scaling the visible range, rather than always
// zooming around the center. Click-drag panning added on top (also real in
// the source, on the container rather than this hook, folded in here).

import { useEffect, useRef } from "react"

export interface UseTimelineScrollOptions {
  containerRef: React.RefObject<HTMLElement | null>
  viewStart: number
  viewEnd: number
  onViewChange: (start: number, end: number) => void
  /** Multiplier for wheel-to-time-delta (pan). */
  scrollSensitivity?: number
  /** Multiplier for wheel-to-zoom-factor. */
  zoomSensitivity?: number
}

export function useTimelineScroll({ containerRef, viewStart, viewEnd, onViewChange, scrollSensitivity = 1, zoomSensitivity = 0.001 }: UseTimelineScrollOptions) {
  // Latest values read from refs inside the event listener instead of
  // being effect dependencies — re-subscribing wheel/mousedown on every
  // view-range change (which happens on every pan/zoom tick) would mean
  // constantly tearing down and rebuilding native listeners mid-gesture.
  const stateRef = useRef({ viewStart, viewEnd, onViewChange, scrollSensitivity, zoomSensitivity })
  stateRef.current = { viewStart, viewEnd, onViewChange, scrollSensitivity, zoomSensitivity }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleWheel(e: WheelEvent) {
      const { viewStart, viewEnd, onViewChange, scrollSensitivity, zoomSensitivity } = stateRef.current
      const range = viewEnd - viewStart
      const isZoomGesture = e.ctrlKey || e.metaKey

      if (isZoomGesture) {
        e.preventDefault()
        const rect = container!.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const fraction = Math.max(0, Math.min(1, mouseX / rect.width))
        const timeAtMouse = viewStart + range * fraction
        const zoomDelta = e.deltaY * -zoomSensitivity
        const newRange = range * (1 - zoomDelta)
        const newStart = timeAtMouse - newRange * fraction
        onViewChange(newStart, newStart + newRange)
      } else {
        e.preventDefault()
        const msPerPixel = range / (container!.getBoundingClientRect().width || 1)
        const deltaMs = e.deltaY * msPerPixel * scrollSensitivity
        onViewChange(viewStart + deltaMs, viewEnd + deltaMs)
      }
    }

    let isDragging = false
    let dragStartX = 0
    let dragStartView = { start: 0, end: 0 }

    function handleMouseDown(e: MouseEvent) {
      if ((e.target as HTMLElement).closest("[data-no-pan]")) return
      isDragging = true
      dragStartX = e.clientX
      dragStartView = { start: stateRef.current.viewStart, end: stateRef.current.viewEnd }
    }

    function handleMouseMove(e: MouseEvent) {
      if (!isDragging) return
      const { onViewChange } = stateRef.current
      const rect = container!.getBoundingClientRect()
      const range = dragStartView.end - dragStartView.start
      const msPerPixel = range / (rect.width || 1)
      const deltaMs = -(e.clientX - dragStartX) * msPerPixel
      onViewChange(dragStartView.start + deltaMs, dragStartView.end + deltaMs)
    }

    function handleMouseUp() {
      isDragging = false
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    container.addEventListener("mousedown", handleMouseDown)
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      container.removeEventListener("wheel", handleWheel)
      container.removeEventListener("mousedown", handleMouseDown)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [containerRef])
}
