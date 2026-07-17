"use client"

import { useRef, useEffect, useCallback } from "react"
import { useThemeColors, withAlpha } from "@workspace/ui/hooks/use-theme-colors"

const NIXIE_ORANGE = "#ff8c00"
const NIXIE_ORANGE_LIGHT = "#ffa040"
const NIXIE_ORANGE_GLOW = "rgba(255, 140, 0, 0.6)"

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function NixieTube({ digit, size }: { digit: string; size: number }) {
  const tc = useThemeColors()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tubeWidth = size * 0.7
  const tubeHeight = size * 1.4
  const cornerRadius = size * 0.18

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, dpr: number) => {
      const w = tubeWidth * dpr
      const h = tubeHeight * dpr
      const r = cornerRadius * dpr
      const s = size * dpr

      ctx.clearRect(0, 0, w, h)

      // Tube body -- dark glass gradient (theme-reactive)
      const tubeBg = withAlpha(tc.card, 0.95)
      const tubeBgLight = withAlpha(tc.card, 0.8)
      const bodyGrad = ctx.createLinearGradient(0, 0, 0, h)
      bodyGrad.addColorStop(0, tubeBgLight)
      bodyGrad.addColorStop(0.5, tubeBg)
      bodyGrad.addColorStop(1, tubeBgLight)
      roundedRect(ctx, 0, 0, w, h, r)
      ctx.fillStyle = bodyGrad
      ctx.fill()

      // Glass highlight reflection
      const highlightGrad = ctx.createLinearGradient(0, 0, 0, h * 0.5)
      highlightGrad.addColorStop(0, "rgba(255, 255, 255, 0.06)")
      highlightGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.02)")
      highlightGrad.addColorStop(1, "transparent")
      roundedRect(ctx, 0, 0, w, h, r)
      ctx.fillStyle = highlightGrad
      ctx.fill()

      if (digit.trim()) {
        const fontSize = s * 0.65
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        const cx = w / 2
        const cy = h / 2

        // Ghost "8" -- wire cathode shapes
        ctx.font = `300 ${fontSize}px ui-monospace, "Cascadia Code", "Fira Code", monospace`
        ctx.fillStyle = "rgba(255, 140, 0, 0.04)"
        ctx.fillText("8", cx, cy)

        // Cathode glow -- blurred orange radiance
        ctx.save()
        ctx.shadowColor = NIXIE_ORANGE_LIGHT
        ctx.shadowBlur = s * 0.12
        ctx.fillStyle = NIXIE_ORANGE_LIGHT
        ctx.globalAlpha = 0.7
        ctx.font = `300 ${fontSize}px ui-monospace, "Cascadia Code", "Fira Code", monospace`
        ctx.fillText(digit, cx, cy)
        ctx.restore()

        // Secondary glow layer for depth
        ctx.save()
        ctx.shadowColor = NIXIE_ORANGE
        ctx.shadowBlur = s * 0.2
        ctx.fillStyle = "transparent"
        ctx.font = `300 ${fontSize}px ui-monospace, "Cascadia Code", "Fira Code", monospace`
        ctx.fillText(digit, cx, cy)
        ctx.restore()

        // Active digit -- crisp with gradient
        const textGrad = ctx.createLinearGradient(0, cy - fontSize / 2, 0, cy + fontSize / 2)
        textGrad.addColorStop(0, NIXIE_ORANGE_LIGHT)
        textGrad.addColorStop(1, NIXIE_ORANGE)
        ctx.font = `500 ${fontSize}px ui-monospace, "Cascadia Code", "Fira Code", monospace`
        ctx.fillStyle = textGrad
        ctx.shadowColor = NIXIE_ORANGE_GLOW
        ctx.shadowBlur = s * 0.08
        ctx.fillText(digit, cx, cy)
        ctx.shadowColor = "transparent"
        ctx.shadowBlur = 0
      }

      // Tube border (theme-reactive)
      roundedRect(ctx, 0.5, 0.5, w - 1, h - 1, r)
      ctx.strokeStyle = withAlpha(tc.border, 0.3)
      ctx.lineWidth = 1
      ctx.stroke()
    },
    [digit, size, tubeWidth, tubeHeight, cornerRadius, tc],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = tubeWidth * dpr
    canvas.height = tubeHeight * dpr

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    draw(ctx, dpr)
  }, [draw, tubeWidth, tubeHeight])

  return (
    <div className="inline-block">
      <canvas ref={canvasRef} style={{ width: tubeWidth, height: tubeHeight }} />
    </div>
  )
}

export interface NixieGlyphsProps {
  value: string | number
  size?: number
}

/** A row of Nixie tubes, one per character of `value` (used for both the
 * single-tube Nixie and the multi-tube NixieBank back-compat wrappers). */
export function NixieGlyphs({ value, size = 36 }: NixieGlyphsProps) {
  const text = String(value)
  return (
    <div className="inline-flex gap-1">
      {Array.from(text).map((char, i) => (
        <NixieTube key={i} digit={char} size={size} />
      ))}
    </div>
  )
}
