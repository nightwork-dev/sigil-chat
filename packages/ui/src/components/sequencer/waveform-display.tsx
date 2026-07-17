"use client"

import { useCallback, useEffect, useRef } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { useThemeColors, withAlpha } from "@workspace/ui/hooks/use-theme-colors"

export interface WaveformDisplayProps {
  /** Audio samples, each -1 to 1 */
  samples: number[]
  /** Playback position 0-1, or null/undefined for no indicator */
  playbackPosition?: number | null
  /** Filled symmetric waveform (true) or line waveform (false) */
  filled?: boolean
  /** Canvas dimensions */
  size?: { width: number; height: number }
  /** Zoom level (1 = full view, higher = zoomed in) */
  zoom?: number
  /** Scroll offset 0-1 when zoomed */
  offset?: number
  className?: string
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function WaveformDisplay({
  samples,
  playbackPosition,
  filled = true,
  size = { width: 260, height: 80 },
  zoom = 1,
  offset = 0,
  className,
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colors = useThemeColors()
  const pad = 6

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
    const midY = rect.y + rect.h / 2

    // Background
    ctx.clearRect(0, 0, size.width, size.height)
    ctx.beginPath()
    ctx.roundRect(0, 0, size.width, size.height, 6)
    ctx.fillStyle = "rgba(0,0,0,0.25)"
    ctx.fill()

    // Center line
    ctx.strokeStyle = withAlpha(colors.border, 0.25)
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(rect.x, midY)
    ctx.lineTo(rect.x + rect.w, midY)
    ctx.stroke()

    // Time division grid
    ctx.strokeStyle = withAlpha(colors.border, 0.1)
    for (let i = 1; i < 5; i++) {
      const x = rect.x + (rect.w * i) / 5
      ctx.beginPath()
      ctx.moveTo(x, rect.y)
      ctx.lineTo(x, rect.y + rect.h)
      ctx.stroke()
    }

    if (samples.length === 0) return

    // Calculate visible window
    const visibleFraction = 1 / Math.max(1, zoom)
    const maxOffset = Math.max(0, 1 - visibleFraction)
    const clampedOffset = clamp(offset, 0, maxOffset)
    const startIdx = Math.floor(clampedOffset * samples.length)
    const windowSize = Math.max(1, Math.floor(visibleFraction * samples.length))
    const endIdx = Math.min(samples.length, startIdx + windowSize)
    const visible = samples.slice(startIdx, endIdx)

    if (visible.length === 0) return

    const accentColor = colors.primary
    const halfH = rect.h / 2

    if (filled) {
      // Filled symmetric waveform
      ctx.beginPath()
      for (let i = 0; i < visible.length; i++) {
        const x = rect.x + (rect.w * i) / Math.max(1, visible.length - 1)
        const amp = Math.abs(clamp(visible[i], -1, 1)) * halfH
        if (i === 0) ctx.moveTo(x, midY - amp)
        else ctx.lineTo(x, midY - amp)
      }
      // Walk back along bottom
      for (let i = visible.length - 1; i >= 0; i--) {
        const x = rect.x + (rect.w * i) / Math.max(1, visible.length - 1)
        const amp = Math.abs(clamp(visible[i], -1, 1)) * halfH
        ctx.lineTo(x, midY + amp)
      }
      ctx.closePath()
      ctx.fillStyle = withAlpha(accentColor, 0.15)
      ctx.fill()

      // Top outline
      ctx.beginPath()
      for (let i = 0; i < visible.length; i++) {
        const x = rect.x + (rect.w * i) / Math.max(1, visible.length - 1)
        const amp = Math.abs(clamp(visible[i], -1, 1)) * halfH
        if (i === 0) ctx.moveTo(x, midY - amp)
        else ctx.lineTo(x, midY - amp)
      }
      ctx.strokeStyle = withAlpha(accentColor, 0.6)
      ctx.lineWidth = 1
      ctx.lineJoin = "round"
      ctx.stroke()

      // Bottom outline
      ctx.beginPath()
      for (let i = 0; i < visible.length; i++) {
        const x = rect.x + (rect.w * i) / Math.max(1, visible.length - 1)
        const amp = Math.abs(clamp(visible[i], -1, 1)) * halfH
        if (i === 0) ctx.moveTo(x, midY + amp)
        else ctx.lineTo(x, midY + amp)
      }
      ctx.strokeStyle = withAlpha(accentColor, 0.6)
      ctx.stroke()
    } else {
      // Line waveform
      ctx.beginPath()
      for (let i = 0; i < visible.length; i++) {
        const x = rect.x + (rect.w * i) / Math.max(1, visible.length - 1)
        const y = midY - clamp(visible[i], -1, 1) * halfH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      // Bloom
      ctx.strokeStyle = withAlpha(accentColor, 0.2)
      ctx.lineWidth = 3
      ctx.lineJoin = "round"
      ctx.stroke()

      // Crisp
      ctx.beginPath()
      for (let i = 0; i < visible.length; i++) {
        const x = rect.x + (rect.w * i) / Math.max(1, visible.length - 1)
        const y = midY - clamp(visible[i], -1, 1) * halfH
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = accentColor
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Playback position
    if (playbackPosition != null) {
      const visStart = clampedOffset
      const visEnd = clampedOffset + visibleFraction
      if (playbackPosition >= visStart && playbackPosition <= visEnd) {
        const localPos = (playbackPosition - visStart) / visibleFraction
        const x = rect.x + rect.w * localPos
        const fgColor = colors.foreground

        // Playback line
        ctx.strokeStyle = withAlpha(fgColor, 0.8)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, rect.y)
        ctx.lineTo(x, rect.y + rect.h)
        ctx.stroke()

        // Triangle marker at top
        ctx.fillStyle = fgColor
        ctx.beginPath()
        ctx.moveTo(x - 3, rect.y)
        ctx.lineTo(x + 3, rect.y)
        ctx.lineTo(x, rect.y + 4)
        ctx.closePath()
        ctx.fill()
      }
    }
  }, [samples, playbackPosition, filled, size, zoom, offset, colors])

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      data-slot="waveform-display"
      style={{ width: size.width, height: size.height }}
      className={cn("rounded-md border border-border", className)}
    />
  )
}
