"use client"

import { useRef, useEffect, useCallback } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { PHOSPHOR_HEX, phosphorRgba } from "@workspace/ui/lib/display-glow"

// Fixed CRT phosphor presets — kept as explicit overrides for when a
// specific historical look is wanted regardless of the active theme. The
// hue itself is shared with LCDDisplay (readout-renderers/lcd-cells.tsx) via
// lib/display-glow — only the alpha here (0.3 glow, 0.1 grid) is this
// component's own.
const colorConfig = {
  green: {
    trace: PHOSPHOR_HEX.green,
    glow: phosphorRgba("green", 0.3),
    grid: phosphorRgba("green", 0.1),
  },
  amber: {
    trace: PHOSPHOR_HEX.amber,
    glow: phosphorRgba("amber", 0.3),
    grid: phosphorRgba("amber", 0.1),
  },
  blue: {
    trace: PHOSPHOR_HEX.blue,
    glow: phosphorRgba("blue", 0.3),
    grid: phosphorRgba("blue", 0.1),
  },
} as const

type OscilloscopeFixedColor = keyof typeof colorConfig
type OscilloscopeColor = OscilloscopeFixedColor | "theme"
interface OscilloscopeColors {
  trace: string
  glow: string
  grid: string
}

/**
 * Canvas can't read `var(--x)` the way DOM style can — strokeStyle/fillStyle
 * need an already-resolved color string, so the active theme's phosphor
 * tokens are read via getComputedStyle at paint time instead.
 */
function resolveThemeColors(canvas: HTMLCanvasElement): OscilloscopeColors {
  const computed = getComputedStyle(canvas)
  return {
    trace: computed.getPropertyValue("--display-text").trim() || colorConfig.amber.trace,
    glow: computed.getPropertyValue("--display-glow").trim() || colorConfig.amber.glow,
    grid: computed.getPropertyValue("--display-ghost").trim() || colorConfig.amber.grid,
  }
}

interface OscilloscopeProps {
  /** Waveform data, values 0-1 */
  data: number[]
  /** Phosphor color (default: "theme" — tracks the active theme's phosphor color) */
  color?: OscilloscopeColor
  /** Display width in px (default: 200) */
  width?: number
  /** Display height in px (default: 120) */
  height?: number
  /** Show grid divisions (default: true) */
  showGrid?: boolean
  className?: string
}

const GRID_X = 5
const GRID_Y = 4
const BEZEL = 6
const CRT_BG = "#050808"
const SCANLINE_SPACING = 2

function Oscilloscope({
  data,
  color = "theme",
  width = 200,
  height = 120,
  showGrid = true,
  className,
}: OscilloscopeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, dpr: number, colors: OscilloscopeColors) => {
      const w = width * dpr
      const h = height * dpr
      const b = BEZEL * dpr
      const screenX = b
      const screenY = b
      const screenW = w - b * 2
      const screenH = h - b * 2

      ctx.clearRect(0, 0, w, h)

      // CRT background
      ctx.fillStyle = CRT_BG
      ctx.fillRect(screenX, screenY, screenW, screenH)

      // Corner vignette -- radial darkening
      const vignetteGrad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(screenW, screenH) * 0.3,
        w / 2,
        h / 2,
        Math.max(screenW, screenH) * 0.6,
      )
      vignetteGrad.addColorStop(0, "transparent")
      vignetteGrad.addColorStop(1, "rgba(0, 0, 0, 0.3)")
      ctx.save()
      ctx.beginPath()
      ctx.rect(screenX, screenY, screenW, screenH)
      ctx.clip()
      ctx.fillStyle = vignetteGrad
      ctx.fillRect(
        screenX - screenW * 0.3,
        screenY - screenH * 0.3,
        screenW * 1.6,
        screenH * 1.6,
      )
      ctx.restore()

      // Grid
      if (showGrid) {
        ctx.strokeStyle = colors.grid
        ctx.lineWidth = 0.5 * dpr
        for (let i = 0; i <= GRID_X; i++) {
          const x = screenX + (screenW * i) / GRID_X
          ctx.beginPath()
          ctx.moveTo(x, screenY)
          ctx.lineTo(x, screenY + screenH)
          ctx.stroke()
        }
        for (let i = 0; i <= GRID_Y; i++) {
          const y = screenY + (screenH * i) / GRID_Y
          ctx.beginPath()
          ctx.moveTo(screenX, y)
          ctx.lineTo(screenX + screenW, y)
          ctx.stroke()
        }
      }

      // Trace
      if (data.length > 1) {
        ctx.beginPath()
        for (let i = 0; i < data.length; i++) {
          const x = screenX + (screenW * i) / (data.length - 1)
          const clamped = Math.max(0, Math.min(1, data[i]))
          const y = screenY + screenH - clamped * screenH

          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }

        // Bloom layer -- wider, semi-transparent
        ctx.strokeStyle = colors.glow
        ctx.lineWidth = 4 * dpr
        ctx.lineJoin = "round"
        ctx.lineCap = "round"
        ctx.stroke()

        // Crisp trace
        ctx.strokeStyle = colors.trace
        ctx.lineWidth = 1.5 * dpr
        ctx.stroke()
      }

      // Scanlines -- CRT effect
      ctx.strokeStyle = "rgba(0, 0, 0, 0.05)"
      ctx.lineWidth = 0.5 * dpr
      for (
        let y = screenY;
        y <= screenY + screenH;
        y += SCANLINE_SPACING * dpr
      ) {
        ctx.beginPath()
        ctx.moveTo(screenX, y)
        ctx.lineTo(screenX + screenW, y)
        ctx.stroke()
      }
    },
    [data, width, height, showGrid],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const paint = () => draw(ctx, dpr, color === "theme" ? resolveThemeColors(canvas) : colorConfig[color])
    paint()

    if (color !== "theme") return
    // A theme switch changes the <html> class, not any prop of this
    // component — repaint whenever that happens so the trace/glow/grid
    // colors track the newly active theme instead of freezing at mount.
    const observer = new MutationObserver(paint)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [draw, width, height, color])

  return (
    <div
      data-slot="oscilloscope"
      className={cn(
        "inline-block rounded-md border border-border bg-card",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        style={{ width, height }}
      />
    </div>
  )
}

export { Oscilloscope }
export type { OscilloscopeProps, OscilloscopeColor }
