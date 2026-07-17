"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

export interface GradientStop {
  id: string
  color: string // CSS color string
  position: number // 0-1
}

export interface GradientEditorProps {
  stops: GradientStop[]
  onChange?: (stops: GradientStop[]) => void
  height?: number
  className?: string
}

let stopIdCounter = 0
function nextStopId() {
  return `gs-${++stopIdCounter}-${Date.now()}`
}

function GradientEditor({
  stops,
  onChange,
  height = 28,
  className,
}: GradientEditorProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const sorted = [...stops].sort((a, b) => a.position - b.position)

  const gradientCSS =
    sorted.length === 0
      ? "var(--color-muted, #1a1a1e)"
      : `linear-gradient(to right, ${sorted.map((s) => `${s.color} ${s.position * 100}%`).join(", ")})`

  const getNormalizedX = useCallback(
    (clientX: number): number => {
      const rect = barRef.current?.getBoundingClientRect()
      if (!rect) return 0
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    },
    [],
  )

  const findClosestStop = useCallback(
    (normX: number): GradientStop | null => {
      let closest: GradientStop | null = null
      let minDist = Infinity
      for (const stop of stops) {
        const dist = Math.abs(stop.position - normX)
        if (dist < minDist) {
          minDist = dist
          closest = stop
        }
      }
      return minDist < 0.05 ? closest : null
    },
    [stops],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
      const normX = getNormalizedX(e.clientX)
      const closest = findClosestStop(normX)

      if (closest) {
        setDraggingId(closest.id)
        setSelectedId(closest.id)
      } else {
        // Click on bar -- add new stop (only if clicking within the gradient bar area)
        const rect = barRef.current?.getBoundingClientRect()
        const clickY = rect ? e.clientY - rect.top : 0
        if (clickY >= 0 && clickY <= height) {
          const newStop: GradientStop = {
            id: nextStopId(),
            color: interpolateColor(sorted, normX),
            position: normX,
          }
          const next = [...stops, newStop]
          setDraggingId(newStop.id)
          setSelectedId(newStop.id)
          onChange?.(next)
        }
      }
    },
    [stops, sorted, height, getNormalizedX, findClosestStop, onChange],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingId || !onChange) return
      const normX = getNormalizedX(e.clientX)
      const next = stops.map((s) => (s.id === draggingId ? { ...s, position: normX } : s))
      onChange(next)
    },
    [draggingId, stops, getNormalizedX, onChange],
  )

  const onPointerUp = useCallback(() => {
    setDraggingId(null)
  }, [])

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onChange) return
      const normX = getNormalizedX(e.clientX)
      const closest = findClosestStop(normX)
      if (closest && stops.length > 2) {
        // Double-click on a stop removes it (keep at least 2)
        onChange(stops.filter((s) => s.id !== closest.id))
      }
    },
    [stops, getNormalizedX, findClosestStop, onChange],
  )

  return (
    <div data-slot="gradient-editor" className={cn("w-full select-none", className)}>
      <div
        ref={barRef}
        className="relative"
        style={{ height: height + 18, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {/* Gradient preview bar */}
        <div
          className="rounded-sm border border-border cursor-crosshair"
          style={{
            height,
            background: gradientCSS,
          }}
        />

        {/* Stop markers — pointer-events-none so all interaction routes through the container */}
        {sorted.map((stop) => {
          const isSelected = stop.id === selectedId
          return (
            <div
              key={stop.id}
              className="absolute flex flex-col items-center pointer-events-none"
              style={{
                left: `${stop.position * 100}%`,
                top: height + 2,
                transform: "translateX(-50%)",
              }}
            >
              {/* Triangle pointer */}
              <svg width="10" height="6" viewBox="0 0 10 6" className="block">
                <polygon
                  points="5,0 0,6 10,6"
                  fill={stop.color}
                  stroke={isSelected ? "var(--color-primary, #d4a574)" : "var(--color-border, rgba(255,255,255,0.12))"}
                  strokeWidth="1"
                />
              </svg>
              {/* Color square */}
              <div
                className={cn(
                  "w-3 h-1.5 rounded-[1px]",
                  isSelected ? "ring-1 ring-primary" : "ring-[0.5px] ring-border",
                )}
                style={{ backgroundColor: stop.color }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function interpolateColor(sorted: GradientStop[], position: number): string {
  if (sorted.length === 0) return "#ffffff"
  if (sorted.length === 1) return sorted[0].color
  const upper = sorted.find((s) => s.position >= position)
  const lower = [...sorted].reverse().find((s) => s.position <= position)
  if (!upper) return sorted[sorted.length - 1].color
  if (!lower) return sorted[0].color
  if (upper.id === lower.id) return lower.color
  // Simple fallback -- return midpoint color
  return lower.color
}

export { GradientEditor }
