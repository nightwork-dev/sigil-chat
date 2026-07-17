"use client"

// Note: the source had a byte-for-byte duplicate of this file under a
// different name — only one was ported.
//
// Restructured as a CONTROLLED component (shapes + onShapesChange
// from the parent, matching the RangeSlider/PinnableTrack convention)
// rather than owning canonical shape state internally, so a future
// derive/solver layer can supply shape geometry through the same
// props instead of this component's local state. Per-shape `locked`
// is new — a locked shape ignores canvas drag and its property
// controls disable, the same "pinned cell" vocabulary a
// constraint-solver uses. The source's
// shadcn Slider + raw number Input property panel is replaced with our
// own ValueScrubber (drag-on-number-text) and CompactSlider (fill-is-
// background) — both gained a `disabled` prop for this port so they
// can express a locked field. Hardcoded blue accent (#3b82f6) and grid
// color (#e5e7eb) swapped for theme tokens; migrated framer-motion ->
// motion/react.

import { createContext, useContext, useState, useRef, useEffect } from "react"
import { AnimatePresence } from "motion/react"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { ValueScrubber } from "@workspace/ui/components/tweak/value-scrubber"
import { CompactSlider } from "@workspace/ui/components/tweak/compact-slider"
import {
  MousePointerIcon,
  MoveIcon,
  SquareIcon,
  CircleIcon,
  TriangleIcon,
  MinusIcon,
  CopyIcon,
  Trash2Icon,
  UndoIcon,
  RedoIcon,
  ZoomInIcon,
  ZoomOutIcon,
  Grid3x3Icon,
  LayersIcon,
  LockIcon,
  UnlockIcon,
} from "lucide-react"

export interface Vector2D {
  x: number
  y: number
}

export interface VectorShape {
  id: string
  type: "rectangle" | "circle" | "triangle" | "line"
  position: Vector2D
  size: Vector2D
  rotation: number
  color: string
  strokeWidth: number
  opacity: number
  /** Ignores canvas drag and property-panel edits — the "pinned cell" of this control surface. */
  locked?: boolean
}

// A VectorShape renders in two real compositions — the SVG primitive +
// selection outline on the canvas, and the ValueScrubber/CompactSlider property
// panel in the sidebar — so it gets the Root/Visual/Properties compound
// treatment, same pattern as Curve (bezier-curve.tsx). Lives in this file
// rather than a separate one: unlike Curve (used from two different files,
// BezierCanvas and CurveList), both parts here are only ever consumed
// inside this one VectorEditor.
interface VectorShapeContextValue {
  shape: VectorShape
  isSelected: boolean
  select: () => void
  update: (updates: Partial<VectorShape>) => void
}

const VectorShapeContext = createContext<VectorShapeContextValue | null>(null)

function useVectorShape() {
  const ctx = useContext(VectorShapeContext)
  if (!ctx) throw new Error("VectorShapeParts must be used within <VectorShapeParts.Root>")
  return ctx
}

function VectorShapeRoot({ value, children }: { value: VectorShapeContextValue; children: React.ReactNode }) {
  return <VectorShapeContext.Provider value={value}>{children}</VectorShapeContext.Provider>
}

/** The SVG primitive + dashed selection outline — the canvas's composition of the shape. */
function VectorShapeVisual() {
  const { shape, isSelected, select } = useVectorShape()
  const { id, type, position, size, rotation, color, strokeWidth, opacity, locked } = shape

  const commonProps = {
    fill: type === "line" ? "none" : color,
    stroke: type === "line" ? color : "none",
    strokeWidth,
    opacity,
    transform: `rotate(${rotation} ${position.x + size.x / 2} ${position.y + size.y / 2})`,
    // No shadow for selection — the dashed outline rect below already
    // signals which shape is selected; a drop-shadow here would just be
    // redundant decoration on top of that.
    className: cn("transition-all duration-200", locked ? "cursor-not-allowed" : "cursor-pointer"),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      select()
    },
  }

  let shapeEl: React.ReactNode
  switch (type) {
    case "rectangle":
      shapeEl = <rect x={position.x} y={position.y} width={size.x} height={size.y} {...commonProps} />
      break
    case "circle":
      shapeEl = <ellipse cx={position.x + size.x / 2} cy={position.y + size.y / 2} rx={size.x / 2} ry={size.y / 2} {...commonProps} />
      break
    case "triangle": {
      const points = `${position.x + size.x / 2},${position.y} ${position.x},${position.y + size.y} ${position.x + size.x},${position.y + size.y}`
      shapeEl = <polygon points={points} {...commonProps} />
      break
    }
    case "line":
      shapeEl = <line x1={position.x} y1={position.y} x2={position.x + size.x} y2={position.y + size.y} {...commonProps} />
      break
  }

  return (
    <g key={id}>
      {shapeEl}
      {isSelected && (
        <rect
          x={position.x - 2}
          y={position.y - 2}
          width={size.x + 4}
          height={size.y + 4}
          fill="none"
          className="stroke-primary"
          strokeWidth={1}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      )}
    </g>
  )
}

/** The ValueScrubber/CompactSlider property panel — the sidebar's composition of the shape. */
function VectorShapeProperties() {
  const { shape, update } = useVectorShape()
  const isLocked = shape.locked ?? false

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <LayersIcon className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Properties</span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => update({ locked: !isLocked })}
          title={isLocked ? "Unlock shape" : "Lock shape"}
          className={isLocked ? "text-primary" : undefined}
        >
          {isLocked ? <LockIcon className="size-3.5" /> : <UnlockIcon className="size-3.5" />}
        </Button>
      </div>

      <div className="space-y-1.5">
        <ValueScrubber label="X" value={shape.position.x} onChange={(v) => update({ position: { ...shape.position, x: v } })} step={1} format={(v) => v.toFixed(0)} disabled={isLocked} />
        <ValueScrubber label="Y" value={shape.position.y} onChange={(v) => update({ position: { ...shape.position, y: v } })} step={1} format={(v) => v.toFixed(0)} disabled={isLocked} />
        <ValueScrubber label="W" value={shape.size.x} onChange={(v) => update({ size: { ...shape.size, x: v } })} step={1} min={1} format={(v) => v.toFixed(0)} disabled={isLocked} />
        <ValueScrubber label="H" value={shape.size.y} onChange={(v) => update({ size: { ...shape.size, y: v } })} step={1} min={1} format={(v) => v.toFixed(0)} disabled={isLocked} />
      </div>

      <CompactSlider label="Rotation" value={shape.rotation} onChange={(v) => update({ rotation: v })} min={0} max={360} step={1} format={(v) => `${v.toFixed(0)}°`} disabled={isLocked} />
      <CompactSlider label="Opacity" value={shape.opacity} onChange={(v) => update({ opacity: v })} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} disabled={isLocked} />
    </div>
  )
}

const VectorShapeParts = { Root: VectorShapeRoot, Visual: VectorShapeVisual, Properties: VectorShapeProperties }

type Tool = "select" | "move" | "rectangle" | "circle" | "triangle" | "line"

interface VectorEditorProps {
  shapes: VectorShape[]
  onShapesChange: (shapes: VectorShape[]) => void
  width?: number
  height?: number
  className?: string
}

export function VectorEditor({ shapes, onShapesChange, width = 640, height = 420, className }: VectorEditorProps) {
  const [selectedShape, setSelectedShape] = useState<string | null>(null)
  const [currentTool, setCurrentTool] = useState<Tool>("select")
  const [isDrawing, setIsDrawing] = useState(false)
  const [dragStart, setDragStart] = useState<Vector2D | null>(null)
  const [zoom, setZoom] = useState(1)
  const [showGrid, setShowGrid] = useState(true)
  const [history, setHistory] = useState<VectorShape[][]>([shapes])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [currentColor, setCurrentColor] = useState("#d4a853")
  const [currentStrokeWidth, setCurrentStrokeWidth] = useState(2)

  const svgRef = useRef<SVGSVGElement>(null)
  // Set true the first time a drag actually moves a shape — lets mouseup
  // commit exactly one history entry per completed move (not one per
  // mousemove tick, and not a no-op entry for a plain click).
  const hasMovedRef = useRef(false)

  // No useCallback below — no memoized children, nothing depends on these
  // functions' referential stability, so memoizing them buys nothing.
  function updateShapes(newShapes: VectorShape[]) {
    onShapesChange(newShapes)
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newShapes)
    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }

  function undo() {
    if (historyIndex <= 0) return
    onShapesChange(history[historyIndex - 1])
    setHistoryIndex(historyIndex - 1)
  }

  function redo() {
    if (historyIndex >= history.length - 1) return
    onShapesChange(history[historyIndex + 1])
    setHistoryIndex(historyIndex + 1)
  }

  function getSVGPoint(event: { clientX: number; clientY: number }) {
    if (!svgRef.current) return { x: 0, y: 0 }
    const rect = svgRef.current.getBoundingClientRect()
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }
  }

  function createShape(type: VectorShape["type"], start: Vector2D, end: Vector2D): VectorShape {
    const size = { x: Math.abs(end.x - start.x), y: Math.abs(end.y - start.y) }
    const position = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) }
    return {
      id: `shape-${shapes.length}-${Math.round(start.x)}-${Math.round(start.y)}`,
      type,
      position,
      size: type === "circle" ? { x: size.x, y: size.x } : size,
      rotation: 0,
      color: currentColor,
      strokeWidth: currentStrokeWidth,
      opacity: 1,
    }
  }

  function handleMouseDown(event: React.MouseEvent) {
    const point = getSVGPoint(event)
    setDragStart(point)
    hasMovedRef.current = false

    if (currentTool === "select" || currentTool === "move") {
      const clicked = shapes.find(
        (shape) =>
          point.x >= shape.position.x &&
          point.x <= shape.position.x + shape.size.x &&
          point.y >= shape.position.y &&
          point.y <= shape.position.y + shape.size.y
      )
      setSelectedShape(clicked?.id ?? null)
    } else {
      setIsDrawing(true)
      setSelectedShape(null)
    }
  }

  function handleMouseMove(event: React.MouseEvent) {
    if (!dragStart) return
    const point = getSVGPoint(event)

    if (selectedShape && (currentTool === "select" || currentTool === "move") && !isDrawing) {
      const shape = shapes.find((s) => s.id === selectedShape)
      if (!shape || shape.locked) return
      const deltaX = point.x - dragStart.x
      const deltaY = point.y - dragStart.y
      hasMovedRef.current = true
      onShapesChange(shapes.map((s) => (s.id === selectedShape ? { ...s, position: { x: s.position.x + deltaX, y: s.position.y + deltaY } } : s)))
      setDragStart(point)
    }
  }

  function handleMouseUp(event: { clientX: number; clientY: number }) {
    if (!dragStart) return
    const point = getSVGPoint(event)

    if (isDrawing && currentTool !== "select" && currentTool !== "move") {
      const newShape = createShape(currentTool, dragStart, point)
      if (newShape.size.x > 5 || newShape.size.y > 5) updateShapes([...shapes, newShape])
    } else if (hasMovedRef.current) {
      // The drag already applied every intermediate position via
      // onShapesChange directly (for a responsive live drag) — commit the
      // final position as one history entry now that the gesture is done.
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(shapes)
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
    }

    hasMovedRef.current = false
    setIsDrawing(false)
    setDragStart(null)
  }

  // The SVG's own onMouseUp only fires if the cursor is still over the SVG
  // at release time — a fast drag that ends outside the canvas bounds never
  // fires it, leaving dragStart/isDrawing stuck until some other
  // interaction happens to reset them. A document-level listener catches
  // the release regardless of where the cursor ends up (same pattern as
  // bezier-curve-editor.tsx's global mouseup during a point drag).
  useEffect(() => {
    if (!dragStart) return
    const handleGlobalMouseUp = (e: MouseEvent) => handleMouseUp(e)
    document.addEventListener("mouseup", handleGlobalMouseUp)
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragStart])

  function handleShapeUpdate(shapeId: string, updates: Partial<VectorShape>) {
    updateShapes(shapes.map((s) => (s.id === shapeId ? { ...s, ...updates } : s)))
  }

  function duplicateShape() {
    const shape = shapes.find((s) => s.id === selectedShape)
    if (!shape) return
    const newShape: VectorShape = { ...shape, id: `${shape.id}-copy-${shapes.length}`, position: { x: shape.position.x + 20, y: shape.position.y + 20 } }
    updateShapes([...shapes, newShape])
    setSelectedShape(newShape.id)
  }

  function deleteShape() {
    if (!selectedShape) return
    updateShapes(shapes.filter((s) => s.id !== selectedShape))
    setSelectedShape(null)
  }

  const renderGrid = () => {
    if (!showGrid) return null
    const gridSize = 20 * zoom
    const lines: React.ReactNode[] = []
    for (let i = 0; i < width; i += gridSize) {
      lines.push(<line key={`v-${i}`} x1={i} y1={0} x2={i} y2={height} className="stroke-border" strokeWidth={0.5} opacity={0.5} />)
    }
    for (let i = 0; i < height; i += gridSize) {
      lines.push(<line key={`h-${i}`} x1={0} y1={i} x2={width} y2={i} className="stroke-border" strokeWidth={0.5} opacity={0.5} />)
    }
    return lines
  }

  const selectedShapeData = selectedShape ? shapes.find((s) => s.id === selectedShape) : null

  const tools: { id: Tool; icon: typeof MousePointerIcon; label: string }[] = [
    { id: "select", icon: MousePointerIcon, label: "Select" },
    { id: "move", icon: MoveIcon, label: "Move" },
    { id: "rectangle", icon: SquareIcon, label: "Rectangle" },
    { id: "circle", icon: CircleIcon, label: "Circle" },
    { id: "triangle", icon: TriangleIcon, label: "Triangle" },
    { id: "line", icon: MinusIcon, label: "Line" },
  ]

  return (
    <div data-slot="vector-editor" className={cn("flex gap-3", className)}>
      <div className="w-56 shrink-0 space-y-3 rounded-md border border-border p-3">
        {/* design-lint-ignore bare-grid — icon toolbar in a fixed w-56 sidebar; 3 cols is intentional, not viewport-dependent */}
        <div className="grid grid-cols-3 gap-1">
          {tools.map((tool) => {
            const Icon = tool.icon
            return (
              <Button key={tool.id} variant={currentTool === tool.id ? "default" : "outline"} size="icon-sm" onClick={() => setCurrentTool(tool.id)} title={tool.label}>
                <Icon className="size-3.5" />
              </Button>
            )
          })}
        </div>

        <div className="flex gap-1">
          <Button variant="outline" size="icon-xs" onClick={undo} disabled={historyIndex <= 0} title="Undo">
            <UndoIcon className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo">
            <RedoIcon className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" onClick={duplicateShape} disabled={!selectedShape} title="Duplicate">
            <CopyIcon className="size-3.5" />
          </Button>
          <Button variant="outline" size="icon-xs" onClick={deleteShape} disabled={!selectedShape} title="Delete" className="text-destructive">
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-xs" onClick={() => setZoom((z) => z * 1.2)} title="Zoom in">
              <ZoomInIcon className="size-3.5" />
            </Button>
            <span className="font-mono text-[10px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon-xs" onClick={() => setZoom((z) => z * 0.8)} title="Zoom out">
              <ZoomOutIcon className="size-3.5" />
            </Button>
          </div>
          <Button variant={showGrid ? "default" : "outline"} size="sm" onClick={() => setShowGrid((v) => !v)} className="w-full">
            <Grid3x3Icon className="mr-1.5 size-3.5" />
            Grid
          </Button>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <label className="font-mono text-[10px] text-muted-foreground">Color</label>
          <input type="color" value={currentColor} onChange={(e) => setCurrentColor(e.target.value)} className="h-7 w-full rounded-sm border border-border bg-card" />
          <CompactSlider label="Stroke" value={currentStrokeWidth} onChange={setCurrentStrokeWidth} min={1} max={10} step={1} format={(v) => v.toFixed(0)} />
        </div>

        {selectedShapeData && (
          <VectorShapeParts.Root
            value={{
              shape: selectedShapeData,
              isSelected: true,
              select: () => setSelectedShape(selectedShapeData.id),
              update: (updates) => handleShapeUpdate(selectedShapeData.id, updates),
            }}
          >
            <VectorShapeParts.Properties />
          </VectorShapeParts.Root>
        )}
      </div>

      <div className="flex-1 overflow-hidden rounded-md border border-border bg-card">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
        >
          {renderGrid()}
          <AnimatePresence>
            {shapes.map((shape) => (
              <VectorShapeParts.Root
                key={shape.id}
                value={{
                  shape,
                  isSelected: selectedShape === shape.id,
                  select: () => setSelectedShape(shape.id),
                  update: (updates) => handleShapeUpdate(shape.id, updates),
                }}
              >
                <VectorShapeParts.Visual />
              </VectorShapeParts.Root>
            ))}
          </AnimatePresence>
        </svg>
      </div>
    </div>
  )
}
