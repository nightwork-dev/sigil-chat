"use client"

import { useRef, useEffect, useCallback, useMemo } from "react"

// Segment encoding: which segments are on for each character
// Segments: 0=top, 1=top-right, 2=bottom-right, 3=bottom, 4=bottom-left, 5=top-left, 6=middle
const SEGMENT_MAP: Record<string, number[]> = {
  "0": [0, 1, 2, 3, 4, 5],
  "1": [1, 2],
  "2": [0, 1, 3, 4, 6],
  "3": [0, 1, 2, 3, 6],
  "4": [1, 2, 5, 6],
  "5": [0, 2, 3, 5, 6],
  "6": [0, 2, 3, 4, 5, 6],
  "7": [0, 1, 2],
  "8": [0, 1, 2, 3, 4, 5, 6],
  "9": [0, 1, 2, 3, 5, 6],
  "-": [6],
  " ": [],
}

type DisplayToken =
  | { type: "digit"; char: string; hasDot: boolean }
  | { type: "colon" }

export interface SegmentDigitsProps {
  value: string | number
  columns?: number
  color?: string
  digitHeight?: number
}

export function SegmentDigits({
  value,
  columns,
  color = "#ff2020",
  digitHeight = 28,
}: SegmentDigitsProps) {
  const text = String(value)
  const digitCount = columns ?? 4
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const digitWidth = digitHeight * 0.55
  const spacing = 4
  const colonWidth = 8
  const padding = 8

  const tokens = useMemo((): DisplayToken[] => {
    const result: DisplayToken[] = []
    const chars = Array.from(text)
    let i = 0
    while (i < chars.length && result.length < digitCount) {
      const ch = chars[i]
      if (ch === ".") {
        // Attach decimal to previous digit if possible
        const last = result[result.length - 1]
        if (last && last.type === "digit" && !last.hasDot) {
          last.hasDot = true
        } else {
          result.push({ type: "digit", char: " ", hasDot: true })
        }
      } else if (ch === ":") {
        result.push({ type: "colon" })
      } else {
        result.push({ type: "digit", char: ch, hasDot: false })
      }
      i++
    }
    // Pad with leading spaces
    while (result.length < digitCount) {
      result.unshift({ type: "digit", char: " ", hasDot: false })
    }
    return result
  }, [text, digitCount])

  const totalWidth = useMemo(() => {
    return (
      tokens.reduce((acc, tok) => {
        return acc + (tok.type === "digit" ? digitWidth : colonWidth) + spacing
      }, 0) -
      spacing +
      padding * 2
    )
  }, [tokens, digitWidth, colonWidth, spacing, padding])

  const totalHeight = digitHeight + padding * 2

  const drawHexagonalSegment = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      horizontal: boolean,
    ) => {
      ctx.beginPath()
      if (horizontal) {
        const half = h / 2
        ctx.moveTo(x + half, y)
        ctx.lineTo(x + w - half, y)
        ctx.lineTo(x + w, y + half)
        ctx.lineTo(x + w - half, y + h)
        ctx.lineTo(x + half, y + h)
        ctx.lineTo(x, y + half)
      } else {
        const half = w / 2
        ctx.moveTo(x + half, y)
        ctx.lineTo(x + w, y + half)
        ctx.lineTo(x + w, y + h - half)
        ctx.lineTo(x + half, y + h)
        ctx.lineTo(x, y + h - half)
        ctx.lineTo(x, y + half)
      }
      ctx.closePath()
      ctx.fill()
    },
    [],
  )

  const drawSegments = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      ox: number,
      oy: number,
      w: number,
      h: number,
      active: Set<number>,
      segColor: string,
    ) => {
      const t = h * 0.09 // segment thickness
      const g = t * 0.3 // gap

      // Parse color to get rgb values for dimming
      const segments: [number, number, number, number, number, boolean][] = [
        // [index, x, y, width, height, horizontal]
        [0, ox + g, oy, w - 2 * g, t, true], // top
        [1, ox + w - t, oy + g, t, h / 2 - g * 1.5, false], // top-right
        [2, ox + w - t, oy + h / 2 + g * 0.5, t, h / 2 - g * 1.5, false], // bottom-right
        [3, ox + g, oy + h - t, w - 2 * g, t, true], // bottom
        [4, ox, oy + h / 2 + g * 0.5, t, h / 2 - g * 1.5, false], // bottom-left
        [5, ox, oy + g, t, h / 2 - g * 1.5, false], // top-left
        [6, ox + g, oy + h / 2 - t / 2, w - 2 * g, t, true], // middle
      ]

      for (const [index, x, y, sw, sh, horizontal] of segments) {
        if (active.has(index)) {
          ctx.fillStyle = segColor
          // Add glow for active segments
          ctx.shadowColor = segColor
          ctx.shadowBlur = 4
        } else {
          ctx.fillStyle = segColor + "0f" // ~6% opacity
          ctx.shadowColor = "transparent"
          ctx.shadowBlur = 0
        }
        drawHexagonalSegment(ctx, x, y, sw, sh, horizontal)
      }
      ctx.shadowColor = "transparent"
      ctx.shadowBlur = 0
    },
    [drawHexagonalSegment],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = totalWidth * dpr
    canvas.height = totalHeight * dpr

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, totalWidth, totalHeight)

    let xPos = padding
    const segH = digitHeight
    const segW = digitWidth
    const cy = totalHeight / 2

    for (const tok of tokens) {
      if (tok.type === "digit") {
        const activeSegments = new Set(SEGMENT_MAP[tok.char] ?? [])
        drawSegments(
          ctx,
          xPos,
          (totalHeight - segH) / 2,
          segW,
          segH,
          activeSegments,
          color,
        )
        if (tok.hasDot) {
          const dotSize = segH * 0.1
          ctx.fillStyle = color
          ctx.shadowColor = color
          ctx.shadowBlur = 3
          ctx.beginPath()
          ctx.arc(
            xPos + segW + 1 + dotSize / 2,
            (totalHeight + segH) / 2 - dotSize - 1 + dotSize / 2,
            dotSize / 2,
            0,
            Math.PI * 2,
          )
          ctx.fill()
          ctx.shadowColor = "transparent"
          ctx.shadowBlur = 0
        }
        xPos += segW + spacing
      } else {
        // Colon
        const dotSize = segH * 0.1
        const cx = xPos + colonWidth / 2
        ctx.fillStyle = color
        ctx.shadowColor = color
        ctx.shadowBlur = 3
        ctx.beginPath()
        ctx.arc(cx, cy - segH * 0.2, dotSize / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(cx, cy + segH * 0.2, dotSize / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowColor = "transparent"
        ctx.shadowBlur = 0
        xPos += colonWidth + spacing
      }
    }
  }, [tokens, color, digitHeight, digitWidth, totalWidth, totalHeight, spacing, colonWidth, padding, drawSegments])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: totalWidth, height: totalHeight }}
    />
  )
}
