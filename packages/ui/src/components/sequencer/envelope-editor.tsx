"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { useThemeColors, withAlpha } from "@workspace/ui/hooks/use-theme-colors"

export interface EnvelopeEditorProps {
  /** Attack time 0-1 */
  attack: number
  /** Decay time 0-1 */
  decay: number
  /** Sustain level 0-1 */
  sustain: number
  /** Release time 0-1 */
  release: number
  onAttackChange?: (v: number) => void
  onDecayChange?: (v: number) => void
  onSustainChange?: (v: number) => void
  onReleaseChange?: (v: number) => void
  /** Canvas dimensions */
  size?: { width: number; height: number }
  /** Use exponential curves instead of linear */
  exponential?: boolean
  className?: string
}

type ADSRPoint = "attack" | "decay" | "sustain" | "release"

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function controlPoints(
  attack: number,
  decay: number,
  sustain: number,
  release: number,
  rect: { x: number; y: number; w: number; h: number },
) {
  const totalTime = attack + decay + release + 0.001
  const usable = rect.w * 0.85
  const attackW = usable * (attack / totalTime)
  const decayW = usable * (decay / totalTime)
  const releaseW = usable * (release / totalTime)
  const sustainW = usable - attackW - decayW - releaseW

  const aX = rect.x + attackW
  const aY = rect.y
  const dX = aX + decayW
  const dY = rect.y + rect.h * (1 - sustain)
  const sX = dX + Math.max(sustainW, rect.w * 0.05)
  const sY = dY
  const rX = sX + releaseW
  const rY = rect.y + rect.h

  return { a: { x: aX, y: aY }, d: { x: dX, y: dY }, s: { x: sX, y: sY }, r: { x: rX, y: rY } }
}

function expCurve(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const cp1x = from.x + (to.x - from.x) * 0.7
  const cp1y = from.y
  const cp2x = from.x + (to.x - from.x) * 0.9
  const cp2y = to.y
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, to.x, to.y)
}

const HIT_RADIUS = 14

export function EnvelopeEditor({
  attack,
  decay,
  sustain,
  release,
  onAttackChange,
  onDecayChange,
  onSustainChange,
  onReleaseChange,
  size = { width: 260, height: 130 },
  exponential = false,
  className,
}: EnvelopeEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draggingRef = useRef<ADSRPoint | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const colors = useThemeColors()
  const pad = 6
  const gridX = 5
  const gridY = 4

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

    // Grid
    ctx.strokeStyle = withAlpha(colors.border, 0.15)
    ctx.lineWidth = 0.5
    for (let i = 0; i <= gridX; i++) {
      const x = rect.x + (rect.w * i) / gridX
      ctx.beginPath()
      ctx.moveTo(x, rect.y)
      ctx.lineTo(x, rect.y + rect.h)
      ctx.stroke()
    }
    for (let i = 0; i <= gridY; i++) {
      const y = rect.y + (rect.h * i) / gridY
      ctx.beginPath()
      ctx.moveTo(rect.x, y)
      ctx.lineTo(rect.x + rect.w, y)
      ctx.stroke()
    }

    // Zero line
    ctx.strokeStyle = withAlpha(colors.border, 0.3)
    ctx.beginPath()
    ctx.moveTo(rect.x, rect.y + rect.h)
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h)
    ctx.stroke()

    const pts = controlPoints(attack, decay, sustain, release, rect)
    const origin = { x: rect.x, y: rect.y + rect.h }
    const accentColor = colors.primary

    // Build curve path
    function traceCurve(c: CanvasRenderingContext2D) {
      c.moveTo(origin.x, origin.y)
      if (exponential) {
        expCurve(c, origin, pts.a)
        expCurve(c, pts.a, pts.d)
      } else {
        c.lineTo(pts.a.x, pts.a.y)
        c.lineTo(pts.d.x, pts.d.y)
      }
      c.lineTo(pts.s.x, pts.s.y)
      if (exponential) {
        expCurve(c, pts.s, pts.r)
      } else {
        c.lineTo(pts.r.x, pts.r.y)
      }
    }

    // Fill under curve
    ctx.beginPath()
    traceCurve(ctx)
    ctx.lineTo(pts.r.x, rect.y + rect.h)
    ctx.lineTo(origin.x, origin.y)
    ctx.closePath()
    ctx.fillStyle = withAlpha(accentColor, 0.08)
    ctx.fill()

    // Bloom stroke
    ctx.beginPath()
    traceCurve(ctx)
    ctx.strokeStyle = withAlpha(accentColor, 0.25)
    ctx.lineWidth = 4
    ctx.lineJoin = "round"
    ctx.stroke()

    // Crisp stroke
    ctx.beginPath()
    traceCurve(ctx)
    ctx.strokeStyle = accentColor
    ctx.lineWidth = 1.5
    ctx.lineJoin = "round"
    ctx.stroke()

    // Control points
    const allPts = [pts.a, pts.d, pts.s, pts.r]
    const dragging = draggingRef.current
    const pointNames: ADSRPoint[] = ["attack", "decay", "sustain", "release"]
    for (let i = 0; i < allPts.length; i++) {
      const pt = allPts[i]
      const isActive = dragging === pointNames[i]
      const r = isActive ? 6 : 4

      if (isActive) {
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, r + 4, 0, Math.PI * 2)
        ctx.fillStyle = withAlpha(accentColor, 0.2)
        ctx.fill()
      }

      ctx.beginPath()
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
      ctx.fillStyle = accentColor
      ctx.fill()

      // Inner highlight
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, r * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(255,255,255,0.3)"
      ctx.fill()
    }

    // Phase labels
    const labels = ["A", "D", "S", "R"]
    const labelPositions = [
      { x: (origin.x + pts.a.x) / 2, y: rect.y + rect.h + 10 },
      { x: (pts.a.x + pts.d.x) / 2, y: rect.y + rect.h + 10 },
      { x: (pts.d.x + pts.s.x) / 2, y: rect.y + rect.h + 10 },
      { x: (pts.s.x + pts.r.x) / 2, y: rect.y + rect.h + 10 },
    ]
    ctx.font = "600 7px ui-monospace, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillStyle = colors.mutedForeground
    for (let i = 0; i < labels.length; i++) {
      ctx.fillText(labels[i], labelPositions[i].x, labelPositions[i].y)
    }
  }, [attack, decay, sustain, release, size, exponential, colors])

  useEffect(() => {
    draw()
  }, [draw])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const br = canvas.getBoundingClientRect()
      const x = e.clientX - br.left
      const y = e.clientY - br.top
      const rect = { x: pad, y: pad, w: size.width - pad * 2, h: size.height - pad * 2 }
      const pts = controlPoints(attack, decay, sustain, release, rect)

      const distances: [ADSRPoint, number][] = [
        ["attack", Math.hypot(x - pts.a.x, y - pts.a.y)],
        ["decay", Math.hypot(x - pts.d.x, y - pts.d.y)],
        ["sustain", Math.hypot(x - pts.s.x, y - pts.s.y)],
        ["release", Math.hypot(x - pts.r.x, y - pts.r.y)],
      ]
      distances.sort((a, b) => a[1] - b[1])

      // Only start drag if pointer is within hit radius of nearest point
      if (distances[0][1] <= HIT_RADIUS) {
        draggingRef.current = distances[0][0]
        setIsDragging(true)
        canvas.setPointerCapture(e.pointerId)
      }
    },
    [attack, decay, sustain, release, size],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const d = draggingRef.current
      if (!d) return
      const canvas = canvasRef.current
      if (!canvas) return
      const br = canvas.getBoundingClientRect()
      const rect = { x: pad, y: pad, w: size.width - pad * 2, h: size.height - pad * 2 }
      const locX = e.clientX - br.left
      const locY = e.clientY - br.top
      const normX = clamp((locX - rect.x) / rect.w, 0, 1)
      const normY = clamp(1 - (locY - rect.y) / rect.h, 0, 1)

      switch (d) {
        case "attack":
          onAttackChange?.(clamp(normX, 0.005, 1))
          break
        case "decay":
          onDecayChange?.(clamp(normX, 0.005, 1))
          break
        case "sustain":
          onSustainChange?.(clamp(normY, 0, 1))
          break
        case "release":
          onReleaseChange?.(clamp(normX, 0.005, 1))
          break
      }
    },
    [size, onAttackChange, onDecayChange, onSustainChange, onReleaseChange],
  )

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = null
    setIsDragging(false)
    const canvas = canvasRef.current
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId)
    }
  }, [])

  return (
    <div data-slot="envelope-editor" className={cn("inline-flex flex-col gap-1", className)}>
      <canvas
        ref={canvasRef}
        style={{ width: size.width, height: size.height, touchAction: "none" }}
        className={cn(
          "rounded-md border border-border",
          isDragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className="flex gap-2 px-0.5">
        {(
          [
            ["A", attack],
            ["D", decay],
            ["S", sustain],
            ["R", release],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex items-center gap-0.5">
            <span className="font-mono text-[8px] font-semibold tracking-wider uppercase text-muted-foreground">
              {label}
            </span>
            <span className="font-mono text-[8px] font-medium tabular-nums text-foreground">
              {value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
