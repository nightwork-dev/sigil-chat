import { cn } from "@workspace/ui/lib/utils"

/**
 * 8-point transform handles for selection in spatial editors.
 *
 * Renders corner + edge handles + optional rotation handle.
 * All handles are zoom-invariant (constant screen-space size).
 *
 * Usage:
 *   <TransformHandles
 *     bounds={{ x: 100, y: 50, width: 200, height: 150 }}
 *     zoom={1.5}
 *     onResize={(handle, dx, dy) => ...}
 *     onRotate={(angle) => ...}
 *   />
 */

import type { Bounds } from "@workspace/graph/types"

export type HandlePosition =
  | "nw" | "n" | "ne"
  | "w" |         "e"
  | "sw" | "s" | "se"

const CURSORS: Record<HandlePosition, string> = {
  nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize",
  w: "ew-resize",                     e: "ew-resize",
  sw: "nesw-resize", s: "ns-resize", se: "nwse-resize",
}

const HANDLE_OFFSETS: Record<HandlePosition, [number, number]> = {
  nw: [0, 0],   n: [0.5, 0],   ne: [1, 0],
  w:  [0, 0.5],                 e:  [1, 0.5],
  sw: [0, 1],   s: [0.5, 1],   se: [1, 1],
}

export interface TransformHandlesProps {
  bounds: Bounds
  zoom: number
  rotation?: number
  showRotation?: boolean
  onResizeStart?: (handle: HandlePosition) => void
  onRotateStart?: () => void
  className?: string
}

export function TransformHandles({
  bounds,
  zoom,
  rotation = 0,
  showRotation = true,
  onResizeStart,
  onRotateStart,
  className,
}: TransformHandlesProps) {
  const handleSize = 8 / zoom // Zoom-invariant
  const half = handleSize / 2
  const rotHandleOffset = 24 / zoom

  return (
    <div
      className={cn("pointer-events-none absolute", className)}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "center center",
      }}
    >
      {/* Selection border */}
      <div
        className="absolute inset-0 border border-primary/60"
        style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.15)" }}
      />

      {/* Resize handles */}
      {(Object.entries(HANDLE_OFFSETS) as [HandlePosition, [number, number]][]).map(
        ([pos, [fx, fy]]) => (
          <div
            key={pos}
            className="pointer-events-auto absolute bg-white border border-primary/80 rounded-[1px]"
            style={{
              width: handleSize,
              height: handleSize,
              left: bounds.width * fx - half,
              top: bounds.height * fy - half,
              cursor: CURSORS[pos],
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              onResizeStart?.(pos)
            }}
          />
        ),
      )}

      {/* Rotation handle */}
      {showRotation && (
        <>
          {/* Guide line from top center to rotation handle */}
          <div
            className="absolute left-1/2 bg-primary/40"
            style={{
              width: 1 / zoom,
              height: rotHandleOffset,
              top: -rotHandleOffset,
              transform: "translateX(-50%)",
            }}
          />
          {/* Rotation circle */}
          <div
            className="pointer-events-auto absolute rounded-full bg-white border-2 border-primary/80"
            style={{
              width: handleSize * 1.2,
              height: handleSize * 1.2,
              left: bounds.width / 2 - (handleSize * 1.2) / 2,
              top: -rotHandleOffset - (handleSize * 1.2) / 2,
              cursor: "grab",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              onRotateStart?.()
            }}
          />
        </>
      )}
    </div>
  )
}
