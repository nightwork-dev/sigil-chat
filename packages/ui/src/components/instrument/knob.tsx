"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import {
  useThemeColors,
  resolveCanvasColor,
} from "@workspace/ui/hooks/use-theme-colors"
import {
  ROTARY_START_DEG,
  detentFraction,
  fractionToAngleDeg,
} from "@workspace/ui/lib/rotary"
import { useBoundedVector } from "@workspace/ui/hooks/use-bounded-vector"

export interface KnobProps {
  /** Display label below the knob */
  label: string
  /** Normalized value 0-1 */
  value: number
  /** Called with new value on drag */
  onChange: (value: number) => void
  /** Diameter in pixels (default 48) */
  size?: number
  /** Override accent color (CSS color string) */
  tint?: string
  /**
   * Number of quantized detents (>=2) to render as dashed radial ticks
   * around the dial. Purely visual unless `snap` is also set — it does not
   * change the emitted value on its own.
   */
  detents?: number
  /**
   * When true (and `detents` is set), the emitted value snaps to the
   * nearest detent instead of moving continuously.
   */
  snap?: boolean
  className?: string
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function Knob({
  label,
  value,
  onChange,
  size = 48,
  tint,
  detents,
  snap = false,
  className,
}: KnobProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const tc = useThemeColors()

  const accentColor = tint ? resolveCanvasColor(tint) : tc.primary
  const borderColor = tc.border
  const surfaceColor = tc.muted

  // Draw knob
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = size
    const h = size
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const cx = w / 2
    const cy = h / 2
    const radius = Math.min(w, h) / 2 - 3

    // Outer ring
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 2
    ctx.stroke()

    // Fill arc proportional to value
    if (value > 0.005) {
      const startRad = degToRad(ROTARY_START_DEG)
      const endRad = degToRad(fractionToAngleDeg(value))
      ctx.beginPath()
      ctx.arc(cx, cy, radius, startRad, endRad)
      ctx.strokeStyle = accentColor
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Quantized-detent ticks — dashed radial lines, purely visual.
    if (detents && detents >= 2) {
      ctx.save()
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      for (let i = 0; i < detents; i++) {
        const rad = degToRad(fractionToAngleDeg(detentFraction(i, detents)))
        const outer = radius + 1
        const inner = radius - 4
        ctx.beginPath()
        ctx.moveTo(cx + inner * Math.cos(rad), cy + inner * Math.sin(rad))
        ctx.lineTo(cx + outer * Math.cos(rad), cy + outer * Math.sin(rad))
        ctx.stroke()
      }
      ctx.restore()
    }

    // Indicator line
    const indicatorRad = degToRad(fractionToAngleDeg(value))
    const innerRadius = radius * 0.3
    const lineStartX = cx + innerRadius * Math.cos(indicatorRad)
    const lineStartY = cy + innerRadius * Math.sin(indicatorRad)
    const lineEndX = cx + (radius - 2) * Math.cos(indicatorRad)
    const lineEndY = cy + (radius - 2) * Math.sin(indicatorRad)
    ctx.beginPath()
    ctx.moveTo(lineStartX, lineStartY)
    ctx.lineTo(lineEndX, lineEndY)
    ctx.strokeStyle = accentColor
    ctx.lineWidth = 2
    ctx.stroke()

    // Center dot
    const dotR = 3
    ctx.beginPath()
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
    ctx.fillStyle = surfaceColor
    ctx.fill()
  }, [value, size, accentColor, borderColor, surfaceColor, detents])

  // Drag STATE MACHINE lives in the interaction core — 200px sweeps the full
  // 0-1 range, matching the knob's previous hand-rolled sensitivity exactly
  // (delta = -(dy)/200, range = max-min = 1, so pixelsPerUnit=200 reproduces
  // it identically). Snap routes through the core's axis `step`: the same
  // snapToStep(next, 1/(detents-1)) call the old code made inline. The
  // angular RENDERING (value → rotation) stays entirely in the draw effect
  // above — the core owns state, not geometry.
  const { targetProps } = useBoundedVector({
    axes: [
      {
        min: 0,
        max: 1,
        step: snap && detents && detents >= 2 ? 1 / (detents - 1) : undefined,
      },
    ],
    value: [value],
    onChange: (next) => onChange(next[0]!),
    mapping: { mode: "relative", axis: "y", pixelsPerUnit: 200, invert: true },
  })
  const { style: targetStyle, ...restTargetProps } = targetProps

  return (
    <div
      data-slot="knob"
      className={cn("inline-flex flex-col items-center gap-1", className)}
    >
      <canvas
        ref={canvasRef}
        className="cursor-ns-resize touch-none"
        style={{ width: size, height: size, ...targetStyle }}
        {...restTargetProps}
      />
      <span className="font-mono text-[9px] tabular-nums text-foreground">
        {value.toFixed(2)}
      </span>
      <span className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground leading-none">
        {label}
      </span>
    </div>
  )
}
