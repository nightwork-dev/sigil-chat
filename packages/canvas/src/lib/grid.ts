/**
 * Grid rendering for canvas editors.
 *
 * Four grid types: lines, dots, hex (tessellation), isometric (30° angles).
 * All zoom-aware with viewport culling.
 */

import type { Viewport } from "@workspace/graph/types"

export type GridType = "none" | "lines" | "dots" | "hex" | "isometric"

export interface GridOptions {
  type: GridType
  size: number
  color: string
  dotColor?: string
}

/** Render grid to a canvas 2D context */
export function renderGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  options: GridOptions,
): void {
  if (options.type === "none") return

  const { size, color } = options
  const scaledSize = size * viewport.zoom

  // Viewport bounds in world space
  const startX = Math.floor(-viewport.x / scaledSize) * scaledSize
  const startY = Math.floor(-viewport.y / scaledSize) * scaledSize
  const endX = canvasWidth + scaledSize
  const endY = canvasHeight + scaledSize

  ctx.save()

  switch (options.type) {
    case "lines":
      renderLines(ctx, startX, startY, endX, endY, scaledSize, color, viewport.zoom)
      break
    case "dots":
      renderDots(ctx, startX, startY, endX, endY, scaledSize, options.dotColor ?? color, viewport.zoom)
      break
    case "hex":
      renderHex(ctx, startX, startY, endX, endY, scaledSize, color, viewport.zoom)
      break
    case "isometric":
      renderIsometric(ctx, startX, startY, endX, endY, scaledSize, color, viewport.zoom, canvasWidth, canvasHeight)
      break
  }

  ctx.restore()
}

function renderLines(
  ctx: CanvasRenderingContext2D,
  startX: number, startY: number, endX: number, endY: number,
  size: number, color: string, zoom: number,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 0.5 / zoom
  ctx.beginPath()

  for (let x = startX; x <= endX; x += size) {
    ctx.moveTo(x, startY)
    ctx.lineTo(x, endY)
  }
  for (let y = startY; y <= endY; y += size) {
    ctx.moveTo(startX, y)
    ctx.lineTo(endX, y)
  }

  ctx.stroke()
}

function renderDots(
  ctx: CanvasRenderingContext2D,
  startX: number, startY: number, endX: number, endY: number,
  size: number, color: string, zoom: number,
): void {
  ctx.fillStyle = color
  const dotSize = 2 / zoom // Zoom-invariant

  for (let x = startX; x <= endX; x += size) {
    for (let y = startY; y <= endY; y += size) {
      ctx.beginPath()
      ctx.arc(x, y, dotSize, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function renderHex(
  ctx: CanvasRenderingContext2D,
  startX: number, startY: number, endX: number, endY: number,
  size: number, color: string, zoom: number,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 0.5 / zoom

  const hexRadius = size / 2
  const hexHeight = hexRadius * Math.sqrt(3)
  const horizSpacing = hexRadius * 1.5
  const vertSpacing = hexHeight * 0.5

  for (let col = Math.floor(startX / horizSpacing); col * horizSpacing <= endX; col++) {
    for (let row = Math.floor(startY / vertSpacing); row * vertSpacing <= endY; row++) {
      const cx = col * horizSpacing + (row % 2 === 0 ? 0 : horizSpacing / 2)
      const cy = row * vertSpacing

      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6
        const px = cx + hexRadius * Math.cos(angle)
        const py = cy + hexRadius * Math.sin(angle)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }
}

function renderIsometric(
  ctx: CanvasRenderingContext2D,
  startX: number, startY: number, endX: number, endY: number,
  size: number, color: string, zoom: number,
  _canvasWidth: number, canvasHeight: number,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 0.5 / zoom

  const isoAngle = Math.PI / 6 // 30°
  const tanAngle = Math.tan(isoAngle)

  ctx.beginPath()

  // Right-leaning lines
  for (let i = Math.floor((startX - canvasHeight * tanAngle) / size); i * size <= endX + canvasHeight * tanAngle; i++) {
    const x = i * size
    ctx.moveTo(x + startY * tanAngle, startY)
    ctx.lineTo(x + endY * tanAngle, endY)
  }

  // Left-leaning lines
  for (let i = Math.floor((startX - canvasHeight * tanAngle) / size); i * size <= endX + canvasHeight * tanAngle; i++) {
    const x = i * size
    ctx.moveTo(x - startY * tanAngle, startY)
    ctx.lineTo(x - endY * tanAngle, endY)
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y += size) {
    ctx.moveTo(startX, y)
    ctx.lineTo(endX, y)
  }

  ctx.stroke()
}
