"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { useThemeColors, withAlpha } from "@workspace/ui/hooks/use-theme-colors"

interface XYPadProps {
  x: number
  y: number
  onChange: (value: { x: number; y: number }) => void
  xRange?: [number, number]
  yRange?: [number, number]
  size?: number
  label?: string
  className?: string
}

// ============================================================================
// XYPad — Full-size 2D value picker
// ============================================================================

function XYPad({
  x,
  y,
  onChange,
  xRange = [-1, 1],
  yRange = [-1, 1],
  size = 120,
  label,
  className,
}: XYPadProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const isDragging = React.useRef(false)

  const normX = React.useMemo(() => {
    const span = xRange[1] - xRange[0]
    return span > 0 ? (x - xRange[0]) / span : 0.5
  }, [x, xRange])

  const normY = React.useMemo(() => {
    const span = yRange[1] - yRange[0]
    // Invert Y so positive is up
    return span > 0 ? 1 - (y - yRange[0]) / span : 0.5
  }, [y, yRange])

  const colors = useThemeColors()

  // Canvas rendering
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const w = size
    const h = size
    const cx = w * 0.5
    const cy = h * 0.5
    const mx = w * normX
    const my = h * normY

    // Clear
    ctx.clearRect(0, 0, w, h)

    // Crosshair axes (dashed)
    ctx.strokeStyle = withAlpha(colors.border, 0.5)
    ctx.lineWidth = 0.5
    ctx.setLineDash([3, 3])

    ctx.beginPath()
    ctx.moveTo(0, cy)
    ctx.lineTo(w, cy)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, h)
    ctx.stroke()

    ctx.setLineDash([])

    // Line from center to marker (dashed)
    ctx.strokeStyle = withAlpha(colors.primary, 0.4)
    ctx.lineWidth = 1
    ctx.setLineDash([4, 2])
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(mx, my)
    ctx.stroke()
    ctx.setLineDash([])

    // Marker dot
    const markerSize = 6
    ctx.fillStyle = colors.primary
    ctx.beginPath()
    ctx.arc(mx, my, markerSize / 2, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = withAlpha(colors.primary, 0.5)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(mx, my, markerSize / 2, 0, Math.PI * 2)
    ctx.stroke()
  }, [size, normX, normY, colors])

  const updateFromPointer = React.useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const fx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const fy = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      const newX = xRange[0] + fx * (xRange[1] - xRange[0])
      // Invert Y
      const newY = yRange[1] - fy * (yRange[1] - yRange[0])
      onChange({ x: newX, y: newY })
    },
    [xRange, yRange, onChange],
  )

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      isDragging.current = true
      updateFromPointer(e.clientX, e.clientY)
    },
    [updateFromPointer],
  )

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      updateFromPointer(e.clientX, e.clientY)
    },
    [updateFromPointer],
  )

  const handlePointerUp = React.useCallback(() => {
    isDragging.current = false
  }, [])

  return (
    <div
      data-slot="xy-pad"
      className={cn("inline-flex flex-col gap-1", className)}
    >
      {/* Label + values */}
      <div className="flex items-center justify-between">
        {label && (
          <span className="font-mono text-[9px] font-medium text-muted-foreground">
            {label}
          </span>
        )}
        <span className="ml-auto flex items-center font-mono text-[9px] tabular-nums text-muted-foreground">
          <span className="inline-block w-[5ch] text-right">{x.toFixed(2)}</span>
          <span>,&nbsp;</span>
          <span className="inline-block w-[5ch] text-right">{y.toFixed(2)}</span>
        </span>
      </div>

      {/* Pad */}
      <div
        ref={containerRef}
        className="relative touch-none cursor-crosshair overflow-hidden rounded-sm border border-border bg-card"
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: size, height: size }}
        />
      </div>
    </div>
  )
}

// ============================================================================
// CompactXYPad — Small inline 2D control
// ============================================================================

interface CompactXYPadProps {
  x: number
  y: number
  onChange: (value: { x: number; y: number }) => void
  xRange?: [number, number]
  yRange?: [number, number]
  size?: number
  label?: string
  className?: string
}

function CompactXYPad({
  x,
  y,
  onChange,
  xRange = [-1, 1],
  yRange = [-1, 1],
  size = 44,
  label,
  className,
}: CompactXYPadProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = React.useState(false)

  const normX = React.useMemo(() => {
    const span = xRange[1] - xRange[0]
    return span > 0 ? (x - xRange[0]) / span : 0.5
  }, [x, xRange])

  const normY = React.useMemo(() => {
    const span = yRange[1] - yRange[0]
    return span > 0 ? 1 - (y - yRange[0]) / span : 0.5
  }, [y, yRange])

  const colors = useThemeColors()

  // Canvas rendering
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const w = size
    const h = size
    const cx = w * 0.5
    const cy = h * 0.5
    const mx = w * normX
    const my = h * normY

    ctx.clearRect(0, 0, w, h)

    // Crosshair
    ctx.strokeStyle = withAlpha(colors.border, 0.5)
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(0, cy)
    ctx.lineTo(w, cy)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, h)
    ctx.stroke()

    // Line from center to marker
    ctx.strokeStyle = withAlpha(colors.primary, 0.5)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(mx, my)
    ctx.stroke()

    // Marker
    const ms = 5
    ctx.fillStyle = colors.primary
    ctx.beginPath()
    ctx.arc(mx, my, ms / 2, 0, Math.PI * 2)
    ctx.fill()
  }, [size, normX, normY, colors])

  const updateFromPointer = React.useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const fx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const fy = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      const newX = xRange[0] + fx * (xRange[1] - xRange[0])
      const newY = yRange[1] - fy * (yRange[1] - yRange[0])
      onChange({ x: newX, y: newY })
    },
    [xRange, yRange, onChange],
  )

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      setIsDragging(true)
      updateFromPointer(e.clientX, e.clientY)
    },
    [updateFromPointer],
  )

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return
      updateFromPointer(e.clientX, e.clientY)
    },
    [isDragging, updateFromPointer],
  )

  const handlePointerUp = React.useCallback(() => {
    setIsDragging(false)
  }, [])

  return (
    <div
      data-slot="compact-xy-pad"
      className={cn("inline-flex flex-col items-start gap-1", className)}
    >
      {label && (
        <span className="font-mono text-[9px] font-medium text-muted-foreground">
          {label}
        </span>
      )}

      {/* Compact pad */}
      <div
        ref={containerRef}
        className={cn(
          "relative touch-none cursor-crosshair overflow-hidden rounded-sm border bg-card",
          isDragging ? "border-primary/50" : "border-border",
        )}
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: size, height: size }}
        />
      </div>

      {/* Value readout — passive display, sits below the pad and stays quiet.
          Each number gets a fixed-width slot so a sign flipping doesn't
          shift the label next to it. */}
      <div className="flex items-center gap-2 font-mono text-[8px] tabular-nums text-muted-foreground">
        <span className="flex items-center gap-1">
          x<span className="inline-block w-[5ch] text-right">{x.toFixed(2)}</span>
        </span>
        <span className="flex items-center gap-1">
          y<span className="inline-block w-[5ch] text-right">{y.toFixed(2)}</span>
        </span>
      </div>
    </div>
  )
}

export { XYPad, CompactXYPad }
export type { XYPadProps, CompactXYPadProps }
