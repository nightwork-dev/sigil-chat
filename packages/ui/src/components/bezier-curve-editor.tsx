"use client"

// The source was already Provider/Context-shaped at the editor level
// (BezierEditorProvider/useBezierEditor) — kept that, but a single
// BezierCurve itself renders in two compositions (path+points on the
// canvas, settings card in the list), so that part is pulled out into
// the Curve.Root/Visual/Card compound in bezier-curve.tsx instead of
// two separate components both reading the same fields off `curve`.
// Removed every useCallback in the provider/canvas — none were
// legitimate (the context value object is rebuilt every render
// regardless; no consumer depends on these for effect stability).
// Hardcoded #3B82F6 default color, `hsl(var(--muted))` (invalid in
// this repo's token system — our vars are full color values, not raw
// HSL triplets) and hardcoded white point-strokes all swapped for
// theme tokens. Marketing-style "Features" bullet list stripped along
// with the rest of the demo — see the `interaction` showcase category
// for a themed demo instead.

import { createContext, useContext, useState, useRef, useEffect, useId } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Curve, type CurveContextValue } from "@workspace/ui/components/bezier-curve"
import { generateCurvePath, randomHexColor, type BezierCurve, type BezierPoint } from "@workspace/ui/lib/bezier-curve"
import { createSeededRandom } from "@workspace/ui/lib/seeded-random"
import { PlusIcon, DownloadIcon, CopyIcon } from "lucide-react"

export type { BezierCurve, CurveType } from "@workspace/ui/lib/bezier-curve"

interface DraggingPoint {
  curveId: string
  pointIndex: number
}

interface BezierEditorState {
  curves: BezierCurve[]
  selectedCurveId: string | null
  draggingPoint: DraggingPoint | null
  width: number
  height: number
}

interface BezierEditorContextValue {
  state: BezierEditorState
  addCurve: () => void
  removeCurve: (id: string) => void
  updateCurve: (id: string, updates: Partial<BezierCurve>) => void
  addPoint: (curveId: string, point: BezierPoint) => void
  removePoint: (curveId: string, pointIndex: number) => void
  updatePoint: (curveId: string, pointIndex: number, point: BezierPoint) => void
  select: (curveId: string) => void
  startDrag: (curveId: string, pointIndex: number) => void
  endDrag: () => void
}

const BezierEditorContext = createContext<BezierEditorContextValue | null>(null)

function useBezierEditor() {
  const ctx = useContext(BezierEditorContext)
  if (!ctx) throw new Error("BezierCurveEditor parts must be used within <BezierEditorProvider>")
  return ctx
}

function defaultCurves(): BezierCurve[] {
  return [
    {
      id: "curve-0",
      points: [
        { x: 0.1, y: 0.8 },
        { x: 0.4, y: 0.2 },
        { x: 0.6, y: 0.7 },
        { x: 0.9, y: 0.3 },
      ],
      // Literal hex, not var(--color-primary) — <input type="color"> requires
      // a real #rrggbb value and silently rejects a CSS custom property.
      color: "#d4a853",
      type: "catmull-rom",
      strokeWidth: 2,
    },
  ]
}

interface BezierEditorProviderProps {
  children: React.ReactNode
  initialCurves?: BezierCurve[]
  width?: number
  height?: number
}

export function BezierEditorProvider({ children, initialCurves, width = 400, height = 260 }: BezierEditorProviderProps) {
  const [state, setState] = useState<BezierEditorState>({
    curves: initialCurves?.length ? initialCurves : defaultCurves(),
    selectedCurveId: null,
    draggingPoint: null,
    width,
    height,
  })

  // No useCallback below — the context value object is rebuilt fresh every
  // render regardless, so memoizing these buys nothing.
  function addCurve() {
    const newCurve: BezierCurve = {
      // Click-time id suffix, seeded from Date.now() rather than a raw
      // Math.random() call — no SSR concern here (event handler, not
      // render), just avoiding Math.random() as a matter of course.
      id: `curve-${state.curves.length}-${Math.round(createSeededRandom(Date.now())() * 1e4)}`,
      points: [
        { x: 0.2, y: 0.6 },
        { x: 0.5, y: 0.4 },
        { x: 0.8, y: 0.6 },
      ],
      color: randomHexColor(),
      type: "catmull-rom",
      strokeWidth: 2,
    }
    setState((prev) => ({ ...prev, curves: [...prev.curves, newCurve], selectedCurveId: newCurve.id }))
  }

  function removeCurve(id: string) {
    setState((prev) => ({
      ...prev,
      curves: prev.curves.filter((c) => c.id !== id),
      selectedCurveId: prev.selectedCurveId === id ? null : prev.selectedCurveId,
    }))
  }

  function updateCurve(id: string, updates: Partial<BezierCurve>) {
    setState((prev) => ({ ...prev, curves: prev.curves.map((c) => (c.id === id ? { ...c, ...updates } : c)) }))
  }

  function addPoint(curveId: string, point: BezierPoint) {
    setState((prev) => ({ ...prev, curves: prev.curves.map((c) => (c.id === curveId ? { ...c, points: [...c.points, point] } : c)) }))
  }

  function removePoint(curveId: string, pointIndex: number) {
    setState((prev) => ({
      ...prev,
      curves: prev.curves.map((c) => (c.id === curveId && c.points.length > 2 ? { ...c, points: c.points.filter((_, i) => i !== pointIndex) } : c)),
    }))
  }

  function updatePoint(curveId: string, pointIndex: number, point: BezierPoint) {
    setState((prev) => ({
      ...prev,
      curves: prev.curves.map((c) => (c.id === curveId ? { ...c, points: c.points.map((p, i) => (i === pointIndex ? point : p)) } : c)),
    }))
  }

  function select(curveId: string) {
    setState((prev) => ({ ...prev, selectedCurveId: curveId }))
  }

  function startDrag(curveId: string, pointIndex: number) {
    setState((prev) => ({ ...prev, draggingPoint: { curveId, pointIndex }, selectedCurveId: curveId }))
  }

  function endDrag() {
    setState((prev) => ({ ...prev, draggingPoint: null }))
  }

  const value: BezierEditorContextValue = { state, addCurve, removeCurve, updateCurve, addPoint, removePoint, updatePoint, select, startDrag, endDrag }

  return <BezierEditorContext.Provider value={value}>{children}</BezierEditorContext.Provider>
}

function buildCurveContext(curve: BezierCurve, index: number, editor: BezierEditorContextValue): CurveContextValue {
  const { state, updatePoint, addPoint, removePoint, updateCurve, removeCurve, select, startDrag } = editor

  return {
    curve,
    index,
    isSelected: state.selectedCurveId === curve.id,
    isDraggingPointIndex: state.draggingPoint?.curveId === curve.id ? state.draggingPoint.pointIndex : null,
    width: state.width,
    height: state.height,
    select: () => select(curve.id),
    remove: () => removeCurve(curve.id),
    removable: state.curves.length > 1,
    updateType: (type) => updateCurve(curve.id, { type }),
    updateColor: (color) => updateCurve(curve.id, { color }),
    updateStrokeWidth: (strokeWidth) => updateCurve(curve.id, { strokeWidth }),
    dragPoint: (pointIndex) => startDrag(curve.id, pointIndex),
    movePoint: (pointIndex, point) => updatePoint(curve.id, pointIndex, point),
    removePoint: (pointIndex) => removePoint(curve.id, pointIndex),
    addPointAt: (point) => addPoint(curve.id, point),
  }
}

export function BezierCanvas({ className }: { className?: string }) {
  const editor = useBezierEditor()
  const { state, updatePoint, endDrag } = editor
  const svgRef = useRef<SVGSVGElement>(null)
  // Instance-scoped — a hardcoded id="bezier-grid" would collide if two
  // BezierCanvases render on one page.
  const gridId = `bezier-grid-${useId()}`

  useEffect(() => {
    if (!state.draggingPoint) return
    const handleGlobalMouseUp = () => endDrag()
    document.addEventListener("mouseup", handleGlobalMouseUp)
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.draggingPoint])

  function handleMouseMove(e: React.MouseEvent) {
    if (!state.draggingPoint || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    updatePoint(state.draggingPoint.curveId, state.draggingPoint.pointIndex, { x, y })
  }

  return (
    <div className={cn("relative overflow-hidden rounded-md border border-border bg-card", className)}>
      <svg ref={svgRef} width="100%" height={state.height} viewBox={`0 0 ${state.width} ${state.height}`} className="cursor-crosshair" onMouseMove={handleMouseMove}>
        <defs>
          <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--color-border)" strokeWidth={0.5} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${gridId})`} />

        {state.curves.map((curve, index) => (
          <Curve.Root key={curve.id} value={buildCurveContext(curve, index, editor)}>
            <Curve.Visual />
          </Curve.Root>
        ))}
      </svg>
      <div className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
        Click a curve to add points · drag to move · double-click to remove
      </div>
    </div>
  )
}

export function CurveList({ className }: { className?: string }) {
  const editor = useBezierEditor()
  const { state } = editor

  return (
    <div className={cn("space-y-2", className)}>
      {state.curves.map((curve, index) => (
        <Curve.Root key={curve.id} value={buildCurveContext(curve, index, editor)}>
          <Curve.Card />
        </Curve.Root>
      ))}
    </div>
  )
}

export function AddCurveButton() {
  const { addCurve } = useBezierEditor()
  return (
    <Button variant="outline" size="sm" onClick={addCurve}>
      <PlusIcon className="mr-1.5 size-3.5" />
      Add Curve
    </Button>
  )
}

export function ExportControls() {
  const { state } = useBezierEditor()

  function buildSvg() {
    const paths = state.curves.map((curve) => `<path d="${generateCurvePath(curve, state.width, state.height)}" fill="none" stroke="${curve.color}" stroke-width="${curve.strokeWidth}" />`).join("\n  ")
    return `<svg width="${state.width}" height="${state.height}" viewBox="0 0 ${state.width} ${state.height}" xmlns="http://www.w3.org/2000/svg">\n  ${paths}\n</svg>`
  }

  async function copySvg() {
    await navigator.clipboard.writeText(buildSvg())
  }

  function downloadSvg() {
    const blob = new Blob([buildSvg()], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "bezier-curves.svg"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={copySvg}>
        <CopyIcon className="mr-1.5 size-3.5" />
        Copy SVG
      </Button>
      <Button variant="outline" size="sm" onClick={downloadSvg}>
        <DownloadIcon className="mr-1.5 size-3.5" />
        Download
      </Button>
    </div>
  )
}
