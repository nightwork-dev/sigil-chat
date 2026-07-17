"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import {
  useThemeColors,
  resolveCanvasColor,
} from "@workspace/ui/hooks/use-theme-colors"

export interface GaugeProps {
  /** Normalized value 0-1 */
  value: number
  /** Display label below the readout */
  label: string
  /** Diameter in pixels (default 100) */
  size?: number
  /** Override accent color (CSS color string) */
  tint?: string
  /** Format string for the display value (default "%.0f") — uses simple substitution */
  precision?: number
  /** Display range mapped from 0-1 (default [0, 100]) */
  displayRange?: [number, number]
  className?: string
}

const TICK_VALUES = [0, 0.25, 0.5, 0.75, 1.0]

/**
 * Map normalized value to a canvas angle sweeping the TOP semicircle.
 * Canvas y points down, so the visible top half spans 180deg -> 360deg
 * (through 270deg = straight up). 0 = left (180deg), 0.5 = up (270deg),
 * 1 = right (360deg). Using 180 - v*180 instead lands every needle/tick in
 * the bottom half, which clips off-canvas since centerY sits near the base.
 */
function angleDeg(v: number): number {
  return 180 + v * 180
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function Gauge({
  value,
  label,
  size = 100,
  tint,
  precision = 0,
  displayRange = [0, 100],
  className,
}: GaugeProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const tc = useThemeColors()

  const accentColor = tint ? resolveCanvasColor(tint) : tc.primary
  const borderColor = tc.border
  const fgColor = tc.foreground
  const mutedColor = tc.mutedForeground

  const canvasWidth = size
  const canvasHeight = size * 0.6

  const displayValue =
    displayRange[0] + value * (displayRange[1] - displayRange[0])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasWidth * dpr
    canvas.height = canvasHeight * dpr
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    const w = canvasWidth
    const h = canvasHeight
    const centerY = h * 0.85
    const centerX = w / 2
    const radius = Math.min(w / 2, h * 0.8) - 4

    // Background arc (full top semicircle: 180deg -> 360deg)
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, degToRad(angleDeg(0)), degToRad(angleDeg(1)), false)
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 2
    ctx.stroke()

    // Filled arc up to value
    if (value > 0.005) {
      const endAngle = angleDeg(value)
      ctx.beginPath()
      ctx.arc(
        centerX,
        centerY,
        radius,
        degToRad(angleDeg(0)),
        degToRad(endAngle),
        false,
      )
      ctx.strokeStyle = accentColor
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Tick marks
    for (const tick of TICK_VALUES) {
      const angle = degToRad(angleDeg(tick))
      const outerX = centerX + (radius + 2) * Math.cos(angle)
      const outerY = centerY + (radius + 2) * Math.sin(angle)
      const innerX = centerX + (radius - 5) * Math.cos(angle)
      const innerY = centerY + (radius - 5) * Math.sin(angle)
      ctx.beginPath()
      ctx.moveTo(outerX, outerY)
      ctx.lineTo(innerX, innerY)
      ctx.strokeStyle = mutedColor
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // Needle
    const needleAngle = degToRad(angleDeg(value))
    const needleTipX = centerX + (radius - 3) * Math.cos(needleAngle)
    const needleTipY = centerY + (radius - 3) * Math.sin(needleAngle)
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.lineTo(needleTipX, needleTipY)
    ctx.strokeStyle = fgColor
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Needle tip circle
    ctx.beginPath()
    ctx.arc(needleTipX, needleTipY, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = accentColor
    ctx.fill()

    // Center pivot
    ctx.beginPath()
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2)
    ctx.fillStyle = fgColor
    ctx.fill()
  }, [
    value,
    size,
    canvasWidth,
    canvasHeight,
    accentColor,
    borderColor,
    fgColor,
    mutedColor,
  ])

  return (
    <div
      data-slot="gauge"
      className={cn("inline-flex flex-col items-center gap-1", className)}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{ width: canvasWidth, height: canvasHeight }}
      />
      <span className="font-mono text-xs tabular-nums text-foreground">
        {displayValue.toFixed(precision)}
      </span>
      <span className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground leading-none">
        {label}
      </span>
    </div>
  )
}
