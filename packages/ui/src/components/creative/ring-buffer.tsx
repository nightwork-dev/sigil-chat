"use client"

import { useCallback } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { useThemeColors, withAlpha } from "@workspace/ui/hooks/use-theme-colors"

export interface RingBufferProps {
  data: number[][] // one array per ring, values 0-1
  pointCount?: number
  colors?: string[]
  size?: number
  sweepAngle?: number // current rotation offset in degrees
  className?: string
}

const FALLBACK_COLORS = [
  "#22c55e", // green
  "#f59e0b", // amber
]

function RingBuffer({
  data,
  pointCount = 64,
  colors: colorsProp,
  size = 120,
  sweepAngle = 0,
  className,
}: RingBufferProps) {
  const themeColors = useThemeColors()
  const colors = colorsProp ?? [themeColors.primary, ...FALLBACK_COLORS]

  const draw = useCallback(
    (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = size * dpr
      canvas.height = size * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, size, size)

      const cx = size / 2
      const cy = size / 2
      const maxR = size / 2 - 4
      const minR = maxR * 0.2

      // Background guide rings
      const guideCount = 4
      for (let i = 0; i <= guideCount; i++) {
        const r = minR + ((maxR - minR) * i) / guideCount
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = "rgba(255,255,255,0.06)"
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      // Cross axes
      for (const angleDeg of [0, 90, 180, 270]) {
        const a = (angleDeg * Math.PI) / 180
        ctx.beginPath()
        ctx.moveTo(cx + minR * Math.cos(a), cy + minR * Math.sin(a))
        ctx.lineTo(cx + maxR * Math.cos(a), cy + maxR * Math.sin(a))
        ctx.strokeStyle = "rgba(255,255,255,0.04)"
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      // Data rings
      for (let ringIdx = 0; ringIdx < data.length; ringIdx++) {
        const ringData = data[ringIdx]
        if (!ringData || ringData.length === 0) continue
        const color = colors[ringIdx % colors.length]
        const count = Math.min(ringData.length, pointCount)

        // Build path
        ctx.beginPath()
        for (let i = 0; i < count; i++) {
          const angleDeg = (360 * i) / count - 90 + sweepAngle
          const angle = (angleDeg * Math.PI) / 180
          const value = Math.max(0, Math.min(1, ringData[i]))
          const r = minR + (maxR - minR) * value
          const px = cx + r * Math.cos(angle)
          const py = cy + r * Math.sin(angle)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()

        // Fill
        ctx.save()
        ctx.globalAlpha = 0.08
        ctx.fillStyle = color
        ctx.fill()
        ctx.restore()

        // Stroke
        ctx.save()
        ctx.globalAlpha = 0.7
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.lineJoin = "round"
        ctx.stroke()
        ctx.restore()

        // Data point dots (every Nth point)
        const dotInterval = Math.max(1, Math.floor(count / 16))
        for (let i = 0; i < count; i++) {
          if (i % dotInterval !== 0) continue
          const value = Math.max(0, Math.min(1, ringData[i]))
          if (value <= 0.01) continue
          const angleDeg = (360 * i) / count - 90 + sweepAngle
          const angle = (angleDeg * Math.PI) / 180
          const r = minR + (maxR - minR) * value
          const px = cx + r * Math.cos(angle)
          const py = cy + r * Math.sin(angle)

          ctx.beginPath()
          ctx.arc(px, py, 2, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }
      }

      // Sweep line
      const sweepA = ((-90 + sweepAngle) * Math.PI) / 180
      ctx.beginPath()
      ctx.moveTo(cx + minR * Math.cos(sweepA), cy + minR * Math.sin(sweepA))
      ctx.lineTo(cx + maxR * Math.cos(sweepA), cy + maxR * Math.sin(sweepA))
      ctx.strokeStyle = withAlpha(themeColors.primary, 0.4)
      ctx.lineWidth = 1
      ctx.stroke()

      // Center dot
      ctx.beginPath()
      ctx.arc(cx, cy, 3, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(30,30,35,1)"
      ctx.fill()
      ctx.strokeStyle = "rgba(255,255,255,0.12)"
      ctx.lineWidth = 0.5
      ctx.stroke()
    },
    [data, pointCount, colors, size, sweepAngle, themeColors],
  )

  const canvasRefCallback = useCallback(
    (node: HTMLCanvasElement | null) => {
      if (node) draw(node)
    },
    [draw],
  )

  return (
    <div
      data-slot="ring-buffer"
      className={cn(
        "inline-block rounded-lg border border-border bg-black/20 overflow-hidden",
        className,
      )}
    >
      <canvas
        ref={canvasRefCallback}
        style={{ width: size, height: size, display: "block" }}
      />
    </div>
  )
}

export { RingBuffer }
