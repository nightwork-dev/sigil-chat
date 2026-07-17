"use client"

// A single BezierCurve renders in two real compositions — the path +
// draggable control points on the SVG canvas, and a settings card (type/
// color/stroke) in the curve list — so it gets the Root/Parts compound
// treatment layered on top of the editor-level context, same pattern as
// Argument (cli-argument-builder).

import { createContext, useContext } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { CompactSlider } from "@workspace/ui/components/tweak/compact-slider"
import { Trash2Icon } from "lucide-react"
import { generateCurvePath, CURVE_TYPE_OPTIONS, type BezierCurve, type CurveType } from "@workspace/ui/lib/bezier-curve"

interface CurveContextValue {
  curve: BezierCurve
  index: number
  isSelected: boolean
  isDraggingPointIndex: number | null
  width: number
  height: number
  select: () => void
  remove: () => void
  removable: boolean
  updateType: (type: CurveType) => void
  updateColor: (color: string) => void
  updateStrokeWidth: (width: number) => void
  dragPoint: (pointIndex: number) => void
  movePoint: (pointIndex: number, point: { x: number; y: number }) => void
  removePoint: (pointIndex: number) => void
  addPointAt: (point: { x: number; y: number }) => void
}

const CurveContext = createContext<CurveContextValue | null>(null)

function useCurve() {
  const ctx = useContext(CurveContext)
  if (!ctx) throw new Error("Curve parts must be used within <Curve.Root>")
  return ctx
}

function Root({ value, children }: { value: CurveContextValue; children: React.ReactNode }) {
  return <CurveContext.Provider value={value}>{children}</CurveContext.Provider>
}

/** The path + draggable control points — composed inside the shared <svg>. */
function Visual() {
  const { curve, isSelected, isDraggingPointIndex, width, height, select, dragPoint, removePoint, addPointAt } = useCurve()

  return (
    <g>
      <path
        d={generateCurvePath(curve, width, height)}
        fill="none"
        stroke={curve.color}
        // Selection is the only thing this width encodes — a decorative
        // drop-shadow was the sole on-canvas selection signal before, but a
        // shadow doesn't clarify elevation on a flat 2D curve; a stroke-
        // width bump is a real, legible emphasis instead.
        strokeWidth={curve.strokeWidth + (isSelected ? 1.5 : 0)}
        className="transition-all duration-200"
        onClick={(e) => {
          e.stopPropagation()
          select()
          const rect = (e.target as SVGPathElement).ownerSVGElement?.getBoundingClientRect()
          if (rect) addPointAt({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height })
        }}
      />
      {curve.points.map((point, index) => (
        <circle
          key={index}
          cx={point.x * width}
          cy={point.y * height}
          r={isSelected ? 6 : 4}
          fill={curve.color}
          className={cn("cursor-move stroke-background transition-[r] duration-150", isDraggingPointIndex === index && "r-8")}
          strokeWidth={2}
          onMouseDown={(e) => {
            e.stopPropagation()
            select()
            dragPoint(index)
          }}
          onDoubleClick={(e) => {
            e.stopPropagation()
            if (curve.points.length > 2) removePoint(index)
          }}
        />
      ))}
    </g>
  )
}

/** The settings card — the list's composition of the same entity. */
function Card({ className }: { className?: string }) {
  const { curve, index, isSelected, select, remove, removable, updateType, updateColor, updateStrokeWidth } = useCurve()

  return (
    <div className={cn("space-y-3 rounded-md border p-3", isSelected ? "border-primary" : "border-border", className)}>
      <div className="flex items-center justify-between">
        <button type="button" className="flex flex-1 items-center gap-2" onClick={select}>
          <div className="size-3.5 rounded-full border border-background" style={{ backgroundColor: curve.color }} />
          <span className="text-xs font-medium">Curve {index + 1}</span>
          <Badge variant="outline" className="text-[9px]">
            {curve.points.length} pts
          </Badge>
        </button>
        <Button variant="ghost" size="icon-xs" onClick={remove} disabled={!removable} title="Remove curve" className="text-destructive">
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>

      {isSelected && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Select value={curve.type} onValueChange={(value) => value && updateType(value)}>
                <SelectTrigger className="h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURVE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Color</FieldLabel>
              <input type="color" value={curve.color} onChange={(e) => updateColor(e.target.value)} className="h-7 w-full rounded-sm border border-border bg-card" />
            </Field>
          </div>
          <CompactSlider label="Stroke Width" value={curve.strokeWidth} onChange={updateStrokeWidth} min={1} max={8} step={0.5} format={(v) => v.toFixed(1)} />
        </div>
      )}
    </div>
  )
}

export const Curve = { Root, Visual, Card }
export type { CurveContextValue }
