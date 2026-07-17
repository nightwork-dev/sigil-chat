// Route: /examples/canvas
// Tree:
//   apps/web/src/routes/__root.tsx    — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/examples.tsx  — global nav strip (wordmark + Components/Examples + theme picker)
//   apps/web/src/routes/examples/canvas.tsx — THIS FILE
// Content: @workspace/canvas + @workspace/graph component catalog

import { createFileRoute } from "@tanstack/react-router"
import { useState, useRef, useEffect, useCallback } from "react"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"

import { TransformHandles } from "@workspace/canvas/components/transform-handles"
import { AlignmentTools, type AlignAction } from "@workspace/canvas/components/alignment-tools"
import { RegistryPalette } from "@workspace/canvas/components/registry-palette"
import { renderGrid, type GridType } from "@workspace/canvas/lib/grid"

import { DataKind } from "@workspace/graph/data-kinds"
import { ReducerRegistry } from "@workspace/graph/reducer"
import { SHAPE_SEMANTICS, type ShapeSemantics } from "@workspace/graph/shape-semantics"
import type { ShapeType } from "@workspace/graph/types"

export const Route = createFileRoute("/examples/canvas")({
  component: CanvasPreview,
})

// --- Mock reducer registry ---

const registry = new ReducerRegistry()
const mockReducers = [
  { id: "math.add", name: "Add", description: "Sum two numbers", inputs: [{ name: "a", kind: DataKind.Number }, { name: "b", kind: DataKind.Number }], outputs: [{ name: "sum", kind: DataKind.Number }], run: () => ({}), pure: true },
  { id: "math.multiply", name: "Multiply", description: "Multiply two numbers", inputs: [{ name: "a", kind: DataKind.Number }, { name: "b", kind: DataKind.Number }], outputs: [{ name: "product", kind: DataKind.Number }], run: () => ({}), pure: true },
  { id: "math.divide", name: "Divide", description: "Divide a by b", inputs: [{ name: "a", kind: DataKind.Number }, { name: "b", kind: DataKind.Number }], outputs: [{ name: "quotient", kind: DataKind.Number }], run: () => ({}), pure: true },
  { id: "logic.and", name: "AND", description: "Logical AND", inputs: [{ name: "a", kind: DataKind.Boolean }, { name: "b", kind: DataKind.Boolean }], outputs: [{ name: "result", kind: DataKind.Boolean }], run: () => ({}), pure: true },
  { id: "logic.or", name: "OR", description: "Logical OR", inputs: [{ name: "a", kind: DataKind.Boolean }, { name: "b", kind: DataKind.Boolean }], outputs: [{ name: "result", kind: DataKind.Boolean }], run: () => ({}), pure: true },
  { id: "logic.not", name: "NOT", description: "Logical NOT", inputs: [{ name: "a", kind: DataKind.Boolean }], outputs: [{ name: "result", kind: DataKind.Boolean }], run: () => ({}), pure: true },
  { id: "text.concat", name: "Concat", description: "Concatenate strings", inputs: [{ name: "a", kind: DataKind.String }, { name: "b", kind: DataKind.String }], outputs: [{ name: "result", kind: DataKind.String }], run: () => ({}), pure: true },
  { id: "text.length", name: "Length", description: "String length", inputs: [{ name: "text", kind: DataKind.String }], outputs: [{ name: "length", kind: DataKind.Number }], run: () => ({}), pure: true },
  { id: "io.fetch", name: "Fetch", description: "HTTP fetch", inputs: [{ name: "url", kind: DataKind.String }], outputs: [{ name: "body", kind: DataKind.String }], run: async () => ({}), async: true },
  { id: "io.log", name: "Log", description: "Console log", inputs: [{ name: "value", kind: DataKind.Any }], outputs: [], run: () => ({}) },
]
mockReducers.forEach((r) => registry.register(r))

// --- Component ---

function CanvasPreview() {
  const [alignCount, setAlignCount] = useState(3)
  const [alignLog, setAlignLog] = useState<string[]>([])
  const [gridType, setGridType] = useState<GridType>("dots")
  const [handleBounds] = useState({ x: 40, y: 20, width: 240, height: 160 })

  const logAlign = useCallback((action: AlignAction) => {
    setAlignLog((prev) => [action, ...prev].slice(0, 5))
  }, [])

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl space-y-8 animate-fade-up">
        <div className="space-y-1">
          <h1 className="text-xl font-medium">Canvas & Graph</h1>
          <p className="text-sm text-muted-foreground">
            <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">@workspace/canvas</code> + <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">@workspace/graph</code>
          </p>
        </div>

        {/* Shape Semantics */}
        <section className="space-y-3">
          <SectionTitle>Shape Semantics — geometry becomes computation</SectionTitle>
          <ImportLine>{'import { SHAPE_SEMANTICS } from "@workspace/graph/shape-semantics"'}</ImportLine>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {(Object.entries(SHAPE_SEMANTICS) as [ShapeType, ShapeSemantics][])
              .filter(([type]) => type !== "group" && type !== "laser")
              .map(([type, sem]) => (
                <Card key={type}>
                  <CardContent className="pt-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <ShapeIcon type={type} />
                      <span className="text-xs font-medium">{sem.name}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground leading-tight">{sem.description}</p>
                    <div className="flex gap-1 flex-wrap">
                      {sem.sockets.filter((s) => s.direction === "input").map((s) => (
                        <Badge key={s.name} variant="outline" className="text-[7px] font-mono px-1 py-0">
                          ←{s.name}
                        </Badge>
                      ))}
                      {sem.sockets.filter((s) => s.direction === "output").map((s) => (
                        <Badge key={s.name} className="text-[7px] font-mono px-1 py-0">
                          {s.name}→
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>

        <Separator />

        {/* Transform Handles */}
        <section className="space-y-3">
          <SectionTitle>TransformHandles — 8-point selection with rotation</SectionTitle>
          <ImportLine>{'import { TransformHandles } from "@workspace/canvas/components/transform-handles"'}</ImportLine>
          <Card>
            <CardContent className="pt-4">
              <div className="relative h-52 bg-muted/30 rounded-lg overflow-hidden">
                <div
                  className="absolute bg-primary/10 border border-primary/20 rounded"
                  style={{ left: handleBounds.x, top: handleBounds.y, width: handleBounds.width, height: handleBounds.height }}
                />
                <TransformHandles
                  bounds={handleBounds}
                  zoom={1}
                  showRotation
                  onResizeStart={(handle) => setAlignLog((p) => [`resize:${handle}`, ...p].slice(0, 5))}
                  onRotateStart={() => setAlignLog((p) => ["rotate", ...p].slice(0, 5))}
                />
                <div className="absolute bottom-2 right-2 text-[9px] font-mono text-muted-foreground">
                  Click handles to log actions
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Alignment Tools */}
        <section className="space-y-3">
          <SectionTitle>AlignmentTools — spatial alignment + distribution</SectionTitle>
          <ImportLine>{'import { AlignmentTools } from "@workspace/canvas/components/alignment-tools"'}</ImportLine>
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-4">
                <AlignmentTools selectedCount={alignCount} onAlign={logAlign} />
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[10px] font-mono text-muted-foreground">selected:</span>
                  {[0, 1, 2, 3, 5].map((n) => (
                    <Button
                      key={n}
                      size="icon-xs"
                      variant={alignCount === n ? "default" : "ghost"}
                      onClick={() => setAlignCount(n)}
                      className="text-[10px] font-mono"
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>
              {alignLog.length > 0 && (
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <span>actions:</span>
                  {alignLog.map((a, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-secondary">{a}</span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* Grid Rendering */}
        <section className="space-y-3">
          <SectionTitle>Grid rendering — 4 types, zoom-aware</SectionTitle>
          <ImportLine>{'import { renderGrid } from "@workspace/canvas/lib/grid"'}</ImportLine>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(["lines", "dots", "hex", "isometric"] as GridType[]).map((type) => (
              <Card key={type} className={gridType === type ? "ring-1 ring-primary/30" : ""}>
                <CardContent className="p-0">
                  <button
                    type="button"
                    onClick={() => setGridType(type)}
                    className="w-full"
                  >
                    <GridCanvas type={type} />
                    <div className="px-3 py-1.5 text-[10px] font-mono text-center text-muted-foreground">
                      {type}
                    </div>
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* Registry Palette */}
        <section className="space-y-3">
          <SectionTitle>RegistryPalette — searchable, auto-categorized</SectionTitle>
          <ImportLine>{'import { RegistryPalette } from "@workspace/canvas/components/registry-palette"'}</ImportLine>
          <Card>
            <CardContent className="p-0 h-72 flex flex-col">
              <RegistryPalette
                registry={registry}
                onSelect={(r) => setAlignLog((p) => [`select:${r.id}`, ...p].slice(0, 5))}
                className="flex-1 min-h-0"
              />
            </CardContent>
          </Card>
          <p className="text-[10px] text-muted-foreground">
            10 mock reducers across 3 categories (Math, Logic, Text, IO). Categories derived from ID prefix — no metadata file needed.
          </p>
        </section>
      </div>
    </div>
  )
}

// --- Grid canvas preview ---

function GridCanvas({ type }: { type: GridType }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height

    // Clear
    ctx.clearRect(0, 0, w, h)

    // Get computed colors
    const style = getComputedStyle(canvas)
    const bg = style.getPropertyValue("--color-background").trim() || "#0d0b0f"
    const gridColor = style.getPropertyValue("--color-border").trim() || "#2a2530"

    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    renderGrid(ctx, { x: 0, y: 0, zoom: 1 }, w, h, {
      type,
      size: 20,
      color: gridColor,
      dotColor: gridColor,
    })
  }, [type])

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={120}
      className="w-full rounded-t-lg"
    />
  )
}

// --- Shape icons (simple SVG representations) ---

function ShapeIcon({ type }: { type: ShapeType }) {
  const size = 16
  const cls = "text-primary"

  switch (type) {
    case "rect":
      return <svg width={size} height={size} className={cls}><rect x={2} y={3} width={12} height={10} fill="none" stroke="currentColor" strokeWidth={1.5} rx={1} /></svg>
    case "ellipse":
      return <svg width={size} height={size} className={cls}><ellipse cx={8} cy={8} rx={6} ry={5} fill="none" stroke="currentColor" strokeWidth={1.5} /></svg>
    case "triangle":
      return <svg width={size} height={size} className={cls}><polygon points="8,2 14,14 2,14" fill="none" stroke="currentColor" strokeWidth={1.5} /></svg>
    case "star":
      return <svg width={size} height={size} className={cls}><polygon points="8,1 10,6 15,6 11,9 12,14 8,11 4,14 5,9 1,6 6,6" fill="none" stroke="currentColor" strokeWidth={1.2} /></svg>
    case "arrow":
      return <svg width={size} height={size} className={cls}><path d="M3 8h8M11 8l-3-3M11 8l-3 3" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
    case "text":
      return <svg width={size} height={size} className={cls}><text x={4} y={12} fontSize={11} fill="currentColor" fontFamily="monospace">T</text></svg>
    case "pen":
      return <svg width={size} height={size} className={cls}><path d="M3 12C5 8 7 4 13 3" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
    case "path":
      return <svg width={size} height={size} className={cls}><path d="M2 12Q8 2 14 8" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" /></svg>
    default:
      return <svg width={size} height={size} className={cls}><circle cx={8} cy={8} r={6} fill="none" stroke="currentColor" strokeWidth={1.5} /></svg>
  }
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{children}</h2>
}

function ImportLine({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-mono text-muted-foreground/50 bg-muted/30 px-2 py-1 rounded">
      {children}
    </div>
  )
}
