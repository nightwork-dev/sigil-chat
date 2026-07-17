"use client"

import { useCallback, useEffect, useRef } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { useThemeColors, withAlpha } from "@workspace/ui/hooks/use-theme-colors"

export interface SpectrumAnalyzerProps {
  /** Band levels, each 0-1 */
  bands: number[]
  /** Number of bands to display (pads/truncates from bands array) */
  bandCount?: number
  /** Canvas dimensions */
  size?: { width: number; height: number }
  /** Use green-yellow-red gradient instead of solid accent */
  gradient?: boolean
  /** Peak hold levels per band (0-1), drawn as thin lines above bars */
  peakHold?: number[]
  className?: string
}

export function SpectrumAnalyzer({
  bands,
  bandCount = 16,
  size = { width: 240, height: 100 },
  gradient = true,
  peakHold,
  className,
}: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colors = useThemeColors()
  const pad = 6
  const barGap = 2

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size.width * dpr
    canvas.height = size.height * dpr
    ctx.scale(dpr, dpr)

    const rect = { x: pad, y: pad, w: size.width - pad * 2, h: size.height - pad * 2 }

    // Background
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.beginPath()
    ctx.roundRect(0, 0, size.width, size.height, 6)
    ctx.fillStyle = "rgba(0,0,0,0.25)"
    ctx.fill()

    // Grid lines
    ctx.strokeStyle = withAlpha(colors.border, 0.1)
    ctx.lineWidth = 0.5
    for (let i = 1; i < 4; i++) {
      const y = rect.y + (rect.h * i) / 4
      ctx.beginPath()
      ctx.moveTo(rect.x, y)
      ctx.lineTo(rect.x + rect.w, y)
      ctx.stroke()
    }

    const barW = (rect.w - (bandCount - 1) * barGap) / bandCount
    if (barW <= 0) return

    const accentColor = colors.primary
    // Gradient mode uses destructive (red), ring (yellow-ish), and a green
    // We approximate chart colors from theme: destructive for high, primary for mid, accent-ish for low
    const gradientHigh = colors.destructive
    const gradientMid = colors.ring
    const gradientLow = colors.primary

    function barColor(position: number): string {
      if (!gradient) return accentColor
      if (position >= 0.8) return gradientHigh
      if (position >= 0.6) return gradientMid
      return gradientLow
    }

    for (let i = 0; i < bandCount; i++) {
      const level = i < bands.length ? Math.max(0, Math.min(1, bands[i])) : 0
      const x = rect.x + i * (barW + barGap)

      if (gradient) {
        // Segmented bars for gradient mode
        const segCount = 12
        const segH = rect.h / segCount
        const segGap = 1

        for (let seg = 0; seg < segCount; seg++) {
          const segPos = seg / segCount
          const segY = rect.y + rect.h - (seg + 1) * segH
          const isLit = segPos < level

          ctx.beginPath()
          ctx.roundRect(x, segY + segGap / 2, barW, segH - segGap, 1)
          ctx.fillStyle = barColor(segPos)
          ctx.globalAlpha = isLit ? 0.8 : 0.04
          ctx.fill()
          ctx.globalAlpha = 1
        }
      } else {
        // Solid bar
        const barH = rect.h * level
        const y = rect.y + rect.h - barH
        ctx.beginPath()
        ctx.roundRect(x, y, barW, barH, 1)
        ctx.fillStyle = accentColor
        ctx.globalAlpha = 0.8
        ctx.fill()
        ctx.globalAlpha = 1

        // Glow at top
        if (barH > 2) {
          ctx.beginPath()
          ctx.roundRect(x, y, barW, Math.min(4, barH), 1)
          ctx.fillStyle = accentColor
          ctx.fill()
        }
      }

      // Peak hold indicator
      const peakVal =
        peakHold && i < peakHold.length
          ? Math.max(0, Math.min(1, peakHold[i]))
          : level
      if (peakVal > 0.01) {
        const peakY = rect.y + rect.h - rect.h * peakVal
        const peakColor = gradient ? barColor(peakVal) : accentColor
        ctx.fillStyle = peakColor
        ctx.fillRect(x, peakY - 1, barW, 2)
      }
    }
  }, [bands, bandCount, size, gradient, peakHold, colors])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      data-slot="spectrum-analyzer"
      style={{ width: size.width, height: size.height }}
      className={cn("rounded-md border border-border", className)}
    />
  )
}
