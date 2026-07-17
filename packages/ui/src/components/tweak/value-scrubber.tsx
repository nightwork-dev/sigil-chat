"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

interface ValueScrubberProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  format?: (value: number) => string
  axis?: "horizontal" | "vertical"
  /** Locked fields ignore drag — the value stays fixed until unlocked. */
  disabled?: boolean
  className?: string
}

function ValueScrubber({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  label,
  format = (v) => v.toFixed(2),
  axis = "horizontal",
  disabled = false,
  className,
}: ValueScrubberProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [dragTranslation, setDragTranslation] = React.useState(0)
  const dragStartValue = React.useRef(0)
  const dragStartPos = React.useRef(0)

  // No useMemo/useCallback below — cheap arithmetic and plain DOM event
  // handlers with no memoized child or effect depending on their
  // referential stability.

  // Touch-optimized pointer scale — one order higher than Tweakpane's mouse default
  const pointerScale = (() => {
    const base = Math.abs(step)
    if (base === 0) return 0.1
    return Math.pow(10, Math.floor(Math.log10(base)))
  })()

  function clamp(v: number) {
    let clamped = v
    if (min !== undefined) clamped = Math.max(min, clamped)
    if (max !== undefined) clamped = Math.min(max, clamped)
    return clamped
  }

  function snap(v: number) {
    if (step > 0) return Math.round(v / step) * step
    return v
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setIsDragging(true)
    dragStartValue.current = value
    dragStartPos.current = axis === "horizontal" ? e.clientX : e.clientY
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging || disabled) return
    const currentPos = axis === "horizontal" ? e.clientX : e.clientY
    const pixelDelta = currentPos - dragStartPos.current
    const translation = axis === "horizontal" ? pixelDelta : pixelDelta
    setDragTranslation(translation)

    // Invert Y so dragging up increases value
    const delta = axis === "horizontal" ? pixelDelta * pointerScale : -pixelDelta * pointerScale

    const newValue = clamp(snap(dragStartValue.current + delta))
    onChange(newValue)
  }

  function handlePointerUp() {
    setIsDragging(false)
    setDragTranslation(0)
  }

  const extensionLength = isDragging && Math.abs(dragTranslation) > 4 ? dragTranslation : 0

  return (
    <div
      data-slot="scrubber"
      className={cn("flex h-5 items-center gap-0", className)}
    >
      {label && (
        <span className="mr-2 min-w-0 shrink-0 truncate font-mono text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
      )}

      <div className="ml-auto flex-none">
        <div
          data-disabled={disabled}
          className={cn(
            "relative flex h-5 w-20 select-none items-center rounded-sm border bg-card",
            disabled
              ? "cursor-not-allowed opacity-50"
              : isDragging
                ? "border-primary/50"
                : "border-border",
            !disabled && (axis === "horizontal" ? "cursor-ew-resize" : "cursor-ns-resize"),
          )}
          style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Drag knob */}
          <div
            className={cn(
              "absolute left-0 top-[3px] bottom-[3px] w-0.5",
              isDragging ? "bg-primary/80" : "bg-primary/15",
            )}
          />

          {/* Value text */}
          <span
            className={cn(
              "w-full px-1.5 text-right font-mono text-[10px] font-medium tabular-nums",
              isDragging
                ? "text-foreground/30"
                : "text-foreground",
            )}
          >
            {format(value)}
          </span>

          {/* Extension line during drag */}
          {extensionLength !== 0 && axis === "horizontal" && (
            <div
              className="pointer-events-none absolute top-1/2 h-px bg-primary/40"
              style={{
                left: extensionLength > 0 ? 2 : undefined,
                right: extensionLength < 0 ? "100%" : undefined,
                width: Math.abs(extensionLength),
                transform: extensionLength < 0
                  ? `translateX(${extensionLength}px)`
                  : undefined,
              }}
            />
          )}

          {extensionLength !== 0 && axis === "vertical" && (
            <div
              className="pointer-events-none absolute left-1/2 w-px bg-primary/40"
              style={{
                top: extensionLength > 0 ? 0 : undefined,
                height: Math.abs(extensionLength),
                transform: extensionLength < 0
                  ? `translateY(${extensionLength}px)`
                  : undefined,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export { ValueScrubber }
export type { ValueScrubberProps }
