"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import {
  useThemeColors,
  resolveCanvasColor,
  withAlpha,
} from "@workspace/ui/hooks/use-theme-colors"

export interface LEDProps {
  /** LED color (CSS color string, e.g. "#22c55e" or "hsl(var(--primary))") */
  color: string
  /** Whether the LED is lit (default true) */
  isOn?: boolean
  /** Animate a pulse when on (default false) */
  pulsing?: boolean
  /** LED die diameter in pixels (default 8) */
  size?: number
  /** Optional label displayed to the right */
  label?: string
  className?: string
}

export function LED({
  color,
  isOn = true,
  pulsing = false,
  size = 8,
  label,
  className,
}: LEDProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const frameRef = React.useRef<number>(0)
  const startTimeRef = React.useRef<number>(0)
  const tc = useThemeColors()

  const resolvedColor = resolveCanvasColor(color)
  const canvasSize = size * 3

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasSize * dpr
    canvas.height = canvasSize * dpr
    canvas.style.width = `${canvasSize}px`
    canvas.style.height = `${canvasSize}px`

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    if (!startTimeRef.current) startTimeRef.current = performance.now()

    function draw(now: number) {
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvasSize, canvasSize)

      const cx = canvasSize / 2
      const cy = canvasSize / 2
      const r = size / 2

      // Pulse alpha
      let pulseAlpha = 1.0
      if (pulsing && isOn) {
        const elapsed = (now - startTimeRef.current) / 1000
        pulseAlpha = 0.5 + 0.5 * Math.cos(elapsed * Math.PI / 0.6)
      }

      // Inset housing
      ctx.beginPath()
      ctx.arc(cx, cy, r + 2, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)"
      ctx.fill()
      ctx.strokeStyle = withAlpha(tc.border, 0.5)
      ctx.lineWidth = 0.5
      ctx.stroke()

      if (isOn) {
        // Outer glow
        const outerR = size * 1.5
        const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR)
        outerGrad.addColorStop(0, withAlpha(resolvedColor, 0.25 * pulseAlpha))
        outerGrad.addColorStop(0.5, withAlpha(resolvedColor, 0.08 * pulseAlpha))
        outerGrad.addColorStop(1, withAlpha(resolvedColor, 0))
        ctx.beginPath()
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
        ctx.fillStyle = outerGrad
        ctx.fill()

        // Inner glow
        const innerR = size * 0.75
        const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR)
        innerGrad.addColorStop(0, withAlpha(resolvedColor, 0.6 * pulseAlpha))
        innerGrad.addColorStop(0.5, withAlpha(resolvedColor, 0.15 * pulseAlpha))
        innerGrad.addColorStop(1, withAlpha(resolvedColor, 0))
        ctx.beginPath()
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
        ctx.fillStyle = innerGrad
        ctx.fill()

        // LED die
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2)
        ctx.fillStyle = withAlpha(resolvedColor, 0.9 * pulseAlpha)
        ctx.fill()

        // Hot spot
        ctx.beginPath()
        ctx.arc(cx, cy - 0.5, size * 0.125, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * pulseAlpha})`
        ctx.fill()
      } else {
        // Off state - die visible but dark
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2)
        ctx.fillStyle = withAlpha(resolvedColor, 0.08)
        ctx.fill()
      }

      if (pulsing && isOn) {
        frameRef.current = requestAnimationFrame(draw)
      }
    }

    frameRef.current = requestAnimationFrame(draw)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [resolvedColor, tc.border, isOn, pulsing, size, canvasSize])

  return (
    <div
      data-slot="led"
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{ width: canvasSize, height: canvasSize }}
      />
      {label && (
        <span className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  )
}

