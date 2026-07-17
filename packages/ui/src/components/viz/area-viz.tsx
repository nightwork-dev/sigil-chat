"use client"

// AreaViz — an actual geometric picture of `area = x · y`, not a node graph.
// The rectangle is x wide by y tall; its filled area is x·y. What's
// guaranteed is solid; what's still open (a range, not a point) is a ghost
// the rectangle could still grow into. A pinned dimension gets a solid
// primary edge, a free one a dashed edge. A conflict paints the figure
// destructive and marks it ⊥.
//
// Coordinate system and dragging come from VizFrame — see viz-frame.tsx.

import { cn } from "@workspace/ui/lib/utils"
import { fmtNum, fmtRange, type Range } from "@workspace/ui/lib/range"
import type { ValueStatus } from "@workspace/ui/lib/value-status"
import { VizFrame, useVizFrame } from "@workspace/ui/components/viz/viz-frame"

interface Dim {
  value: Range
  status: ValueStatus
}

interface AreaVizProps {
  x: Dim
  y: Dim
  area: Dim
  maxX: number
  maxY: number
  /** When provided, the rectangle's width/height edges become draggable handles that set x / y directly. */
  onPinX?: (v: number) => void
  onPinY?: (v: number) => void
  className?: string
}

const isBottomRange = (r: Range) => r.lo > r.hi

const PAD = { left: 26, top: 10, right: 12, bottom: 20 }
const W = 200
const H = 130
const VB_W = PAD.left + W + PAD.right
const VB_H = PAD.top + H + PAD.bottom

function AreaViz({ x, y, area, maxX, maxY, onPinX, onPinY, className }: AreaVizProps) {
  return (
    <div data-slot="area-viz" className={cn("flex justify-center", className)}>
      <VizFrame.Root
        xDomain={[0, maxX]}
        yDomain={[0, maxY]}
        width={VB_W}
        height={VB_H}
        pad={PAD}
        ariaLabel={`area = x × y; x ${fmtRange(x.value)}, y ${fmtRange(y.value)}, area ${fmtRange(area.value)}`}
      >
        <AreaVizPlot x={x} y={y} area={area} maxX={maxX} maxY={maxY} onPinX={onPinX} onPinY={onPinY} />
      </VizFrame.Root>
    </div>
  )
}

function AreaVizPlot({ x, y, area, maxX, maxY, onPinX, onPinY }: Omit<AreaVizProps, "className">) {
  const { frame } = useVizFrame()
  const px = frame.x
  const py = frame.y
  const baseY = frame.plotBottom

  const conflicting = area.status === "conflicting" || isBottomRange(area.value) || isBottomRange(x.value) || isBottomRange(y.value)

  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v))
  const xlo = clamp(Number.isFinite(x.value.lo) ? x.value.lo : 0, maxX)
  const xhi = clamp(Number.isFinite(x.value.hi) ? x.value.hi : maxX, maxX)
  const ylo = clamp(Number.isFinite(y.value.lo) ? y.value.lo : 0, maxY)
  const yhi = clamp(Number.isFinite(y.value.hi) ? y.value.hi : maxY, maxY)

  const xIsRange = xhi > xlo + 1e-9
  const yIsRange = yhi > ylo + 1e-9
  const xFinite = Number.isFinite(x.value.lo) && Number.isFinite(x.value.hi)
  const yFinite = Number.isFinite(y.value.lo) && Number.isFinite(y.value.hi)
  const xEdge = x.status === "pinned" ? "var(--color-primary)" : "var(--color-muted-foreground)"
  const yEdge = y.status === "pinned" ? "var(--color-primary)" : "var(--color-muted-foreground)"

  return (
    <>
      <VizFrame.Grid />

      {conflicting ? (
        xFinite && yFinite ? (
          <>
            <rect
              x={PAD.left}
              y={py(ylo)}
              width={Math.max(0, px(xlo) - PAD.left)}
              height={Math.max(0, baseY - py(ylo))}
              fill="var(--color-primary)"
              fillOpacity={0.18}
              stroke="var(--color-primary)"
              strokeOpacity={0.6}
            />
            {px(xlo) - PAD.left > 28 && baseY - py(ylo) > 16 && (
              <text x={(PAD.left + px(xlo)) / 2} y={(baseY + py(ylo)) / 2} textAnchor="middle" dominantBaseline="central" fontSize={10} fontFamily="var(--font-mono, ui-monospace, monospace)" fill="var(--color-foreground)">
                {fmtNum(xlo * ylo)}
              </text>
            )}
            <text x={px(xlo) + 9} y={py(ylo)} textAnchor="middle" dominantBaseline="central" fontSize={13} fill="var(--color-destructive)">⊥</text>
          </>
        ) : (
          <>
            <rect x={PAD.left} y={PAD.top} width={W} height={H} fill="var(--color-destructive)" fillOpacity={0.1} stroke="var(--color-destructive)" strokeOpacity={0.5} strokeDasharray="3 3" />
            <text x={PAD.left + W / 2} y={PAD.top + H / 2} textAnchor="middle" dominantBaseline="central" fontSize={16} fill="var(--color-destructive)">⊥</text>
          </>
        )
      ) : (
        <>
          {xIsRange && (
            <rect x={px(xlo)} y={py(yhi)} width={Math.max(0, px(xhi) - px(xlo))} height={Math.max(0, baseY - py(yhi))} fill="var(--color-primary)" fillOpacity={0.08} stroke="var(--color-primary)" strokeOpacity={0.3} strokeDasharray="3 3" />
          )}
          {yIsRange && (
            <rect x={PAD.left} y={py(yhi)} width={Math.max(0, px(xlo) - PAD.left)} height={Math.max(0, py(ylo) - py(yhi))} fill="var(--color-primary)" fillOpacity={0.08} stroke="var(--color-primary)" strokeOpacity={0.3} strokeDasharray="3 3" />
          )}
          <rect x={PAD.left} y={py(ylo)} width={Math.max(0, px(xlo) - PAD.left)} height={Math.max(0, baseY - py(ylo))} fill="var(--color-primary)" fillOpacity={0.22} stroke="none" />
          <line x1={PAD.left} y1={py(ylo)} x2={px(xlo)} y2={py(ylo)} stroke={xEdge} strokeWidth={1.5} strokeDasharray={x.status === "pinned" ? undefined : "3 2"} />
          <line x1={PAD.left} y1={baseY} x2={px(xlo)} y2={baseY} stroke={xEdge} strokeWidth={1.5} strokeDasharray={x.status === "pinned" ? undefined : "3 2"} />
          <line x1={PAD.left} y1={baseY} x2={PAD.left} y2={py(ylo)} stroke={yEdge} strokeWidth={1.5} strokeDasharray={y.status === "pinned" ? undefined : "3 2"} />
          <line x1={px(xlo)} y1={baseY} x2={px(xlo)} y2={py(ylo)} stroke={yEdge} strokeWidth={1.5} strokeDasharray={y.status === "pinned" ? undefined : "3 2"} />
          {px(xlo) - PAD.left > 30 && baseY - py(ylo) > 18 && (
            <text x={(PAD.left + px(xlo)) / 2} y={(baseY + py(ylo)) / 2} textAnchor="middle" dominantBaseline="central" fontSize={10} fontFamily="var(--font-mono, ui-monospace, monospace)" fill="var(--color-foreground)">
              {fmtRange(area.value)}
            </text>
          )}
          {onPinX && (
            <VizFrame.Handle axis="x" value={xlo} onChange={onPinX}>
              <rect x={px(xlo) - 2.5} y={(py(ylo) + baseY) / 2 - 9} width={5} height={18} rx={2.5} fill="var(--color-primary)" stroke="var(--color-background)" strokeWidth={1} style={{ pointerEvents: "none" }} />
            </VizFrame.Handle>
          )}
          {onPinY && (
            <VizFrame.Handle axis="y" value={ylo} onChange={onPinY}>
              <rect x={(PAD.left + px(xlo)) / 2 - 9} y={py(ylo) - 2.5} width={18} height={5} rx={2.5} fill="var(--color-primary)" stroke="var(--color-background)" strokeWidth={1} style={{ pointerEvents: "none" }} />
            </VizFrame.Handle>
          )}
        </>
      )}

      <text x={(PAD.left + px(xhi)) / 2} y={baseY + 13} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono, ui-monospace, monospace)" fill="var(--color-muted-foreground)">
        x = {fmtRange(x.value)}
      </text>
      <text x={PAD.left - 5} y={py(yhi / 2 + ylo / 2) || PAD.top + H / 2} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono, ui-monospace, monospace)" fill="var(--color-muted-foreground)" transform={`rotate(-90 ${PAD.left - 5} ${PAD.top + H / 2})`}>
        y = {fmtRange(y.value)}
      </text>
    </>
  )
}

export { AreaViz }
export type { AreaVizProps }
