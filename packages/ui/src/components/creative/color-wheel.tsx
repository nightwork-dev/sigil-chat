"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { hsbToCss } from "@workspace/ui/lib/color"
import { useThemeColors } from "@workspace/ui/hooks/use-theme-colors"

export interface ColorWheelProps {
  hue: number // 0-360
  saturation: number // 0-1
  brightness: number // 0-1
  size?: number
  onChange?: (value: { hue: number; saturation: number; brightness: number }) => void
  className?: string
}

const RING_WIDTH = 14

function ColorWheel({
  hue,
  saturation,
  brightness,
  size = 120,
  onChange,
  className,
}: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragging, setDragging] = useState<"wheel" | "square" | null>(null)

  const outerR = size / 2 - 2
  const innerR = outerR - RING_WIDTH
  const squareSide = innerR * Math.SQRT2 * 0.78
  const squareOrigin = { x: size / 2 - squareSide / 2, y: size / 2 - squareSide / 2 }

  const currentColor = hsbToCss({ h: hue, s: saturation, b: brightness })
  const themeColors = useThemeColors()

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

      // Hue ring -- segmented arcs
      const segments = 72
      for (let i = 0; i < segments; i++) {
        const startAngle = ((i * 360) / segments - 90) * (Math.PI / 180)
        const endAngle = (((i + 1) * 360) / segments - 90) * (Math.PI / 180)
        const segHue = (i / segments) * 360

        ctx.beginPath()
        ctx.arc(cx, cy, (outerR + innerR) / 2, startAngle, endAngle)
        ctx.strokeStyle = `hsl(${segHue}, 100%, 50%)`
        ctx.lineWidth = RING_WIDTH
        ctx.stroke()
      }

      // Ring borders
      ctx.beginPath()
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
      ctx.strokeStyle = themeColors.border
      ctx.lineWidth = 0.5
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(cx, cy, innerR, 0, Math.PI * 2)
      ctx.strokeStyle = themeColors.border
      ctx.lineWidth = 0.5
      ctx.stroke()

      // Hue indicator on ring
      const hueAngle = (hue - 90) * (Math.PI / 180)
      const hueR = (outerR + innerR) / 2
      const huePt = {
        x: cx + hueR * Math.cos(hueAngle),
        y: cy + hueR * Math.sin(hueAngle),
      }
      const indicatorR = RING_WIDTH / 2 - 1
      ctx.beginPath()
      ctx.arc(huePt.x, huePt.y, indicatorR, 0, Math.PI * 2)
      ctx.strokeStyle = "white"
      ctx.lineWidth = 2
      ctx.stroke()

      // Sat/brightness square
      const sqX = squareOrigin.x
      const sqY = squareOrigin.y

      // Base hue fill
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`
      ctx.beginPath()
      ctx.roundRect(sqX, sqY, squareSide, squareSide, 2)
      ctx.fill()

      // White gradient (left to right)
      const whiteGrad = ctx.createLinearGradient(sqX, sqY, sqX + squareSide, sqY)
      whiteGrad.addColorStop(0, "rgba(255,255,255,1)")
      whiteGrad.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = whiteGrad
      ctx.beginPath()
      ctx.roundRect(sqX, sqY, squareSide, squareSide, 2)
      ctx.fill()

      // Black gradient (top to bottom)
      const blackGrad = ctx.createLinearGradient(sqX, sqY, sqX, sqY + squareSide)
      blackGrad.addColorStop(0, "rgba(0,0,0,0)")
      blackGrad.addColorStop(1, "rgba(0,0,0,1)")
      ctx.fillStyle = blackGrad
      ctx.beginPath()
      ctx.roundRect(sqX, sqY, squareSide, squareSide, 2)
      ctx.fill()

      // Square border
      ctx.beginPath()
      ctx.roundRect(sqX, sqY, squareSide, squareSide, 2)
      ctx.strokeStyle = "rgba(255,255,255,0.12)"
      ctx.lineWidth = 0.5
      ctx.stroke()

      // Crosshair
      const crossX = sqX + saturation * squareSide
      const crossY = sqY + (1 - brightness) * squareSide
      const crossR = 4

      ctx.beginPath()
      ctx.arc(crossX, crossY, crossR, 0, Math.PI * 2)
      ctx.strokeStyle = "white"
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(crossX, crossY, crossR + 1, 0, Math.PI * 2)
      ctx.strokeStyle = "rgba(0,0,0,0.5)"
      ctx.lineWidth = 0.5
      ctx.stroke()
    },
    [hue, saturation, brightness, size, outerR, innerR, squareSide, squareOrigin.x, squareOrigin.y, themeColors],
  )

  const canvasRefCallback = useCallback(
    (node: HTMLCanvasElement | null) => {
      if (node) {
        canvasRef.current = node
        draw(node)
      }
    },
    [draw],
  )

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>, zone: "wheel" | "square" | null) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect || !onChange) return

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const cx = size / 2
      const cy = size / 2
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Determine zone on first event
      let activeZone = zone
      if (!activeZone) {
        if (dist >= innerR - 4 && dist <= outerR + 4) {
          activeZone = "wheel"
        } else if (dist < innerR) {
          activeZone = "square"
        }
      }

      if (activeZone === "wheel") {
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90
        if (angle < 0) angle += 360
        onChange({ hue: angle, saturation, brightness })
        return "wheel" as const
      }

      if (activeZone === "square") {
        const normX = Math.max(0, Math.min(1, (x - squareOrigin.x) / squareSide))
        const normY = Math.max(0, Math.min(1, (y - squareOrigin.y) / squareSide))
        onChange({ hue, saturation: normX, brightness: 1 - normY })
        return "square" as const
      }

      return null
    },
    [hue, saturation, brightness, size, outerR, innerR, squareSide, squareOrigin.x, squareOrigin.y, onChange],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      const zone = handlePointer(e, null)
      setDragging(zone ?? null)
    },
    [handlePointer],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragging) handlePointer(e, dragging)
    },
    [dragging, handlePointer],
  )

  const onPointerUp = useCallback(() => {
    setDragging(null)
  }, [])

  return (
    <div data-slot="color-wheel" className={cn("inline-flex flex-col items-center gap-1.5", className)}>
      <canvas
        ref={canvasRefCallback}
        style={{ width: size, height: size, cursor: "crosshair", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {/* Swatch + readout */}
      <div className="flex items-center gap-1.5">
        <div
          className="h-3.5 w-5 rounded-sm border border-border"
          style={{ backgroundColor: currentColor }}
        />
        <span className="font-mono text-[9px] tracking-wider uppercase text-muted-foreground tabular-nums">
          H{Math.round(hue)} S{Math.round(saturation * 100)} B{Math.round(brightness * 100)}
        </span>
      </div>
    </div>
  )
}

export { ColorWheel }
