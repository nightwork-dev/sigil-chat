// CurveViz — an actual picture of `y = f(x, table)`: a piecewise-linear
// curve over a table of (x, y) points, with a dot marking where the current
// x maps to y. Dashed guide lines run from the dot to each axis so x and y
// can be read off directly; when x is a range, a faint vertical band shows
// the slice of curve still in play.
//
// Coordinate system and path generation come from VizFrame — see
// viz-frame.tsx. The polyline is VizFrame.Line, which uses d3-shape's line()
// with its default curveLinear — the same straight-segment interpolation
// this component always drew by hand.

import { cn } from "@workspace/ui/lib/utils"
import { fmtNum, type Range } from "@workspace/ui/lib/range"
import { svgPaint, type ValueStatus } from "@workspace/ui/lib/value-status"
import { VizFrame, useVizFrame } from "@workspace/ui/components/viz/viz-frame"

interface CurveVizProps {
  x: { value: Range; status: ValueStatus }
  y: { value: Range; status: ValueStatus }
  curve: ReadonlyArray<readonly [number, number]>
  className?: string
}

const isBottomRange = (r: Range) => r.lo > r.hi

// A readable representative for a (possibly open) range: the finite
// midpoint when both bounds are finite, otherwise whichever finite bound exists.
function representative(v: Range): number | null {
  if (isBottomRange(v)) return null
  const loF = Number.isFinite(v.lo)
  const hiF = Number.isFinite(v.hi)
  if (loF && hiF) return (v.lo + v.hi) / 2
  if (loF) return v.lo
  if (hiF) return v.hi
  return null
}

const PAD = { left: 30, top: 10, right: 14, bottom: 18 }
const W = 176
const H = 110
const VB_W = PAD.left + W + PAD.right
const VB_H = PAD.top + H + PAD.bottom

function CurveViz({ x, y, curve, className }: CurveVizProps) {
  const xs = curve.map((p) => p[0])
  const ys = curve.map((p) => p[1])
  const xMin = xs.length ? Math.min(...xs) : 0
  const xMax = xs.length ? Math.max(...xs) : 1
  const yMin = 0
  const yMax = ys.length ? Math.max(yMin, ...ys) : 1
  const xRep = representative(x.value)
  const yRep = representative(y.value)

  return (
    <div data-slot="curve-viz" className={cn("flex justify-center", className)}>
      <VizFrame.Root
        xDomain={[xMin, xMax]}
        yDomain={[yMin, yMax]}
        width={VB_W}
        height={VB_H}
        pad={PAD}
        ariaLabel={`y = f(x); x ${fmtNum(xRep ?? xMin)}, y ${fmtNum(yRep ?? yMin)}`}
      >
        <CurveVizPlot x={x} y={y} curve={curve} xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax} />
      </VizFrame.Root>
    </div>
  )
}

interface PlotProps {
  x: CurveVizProps["x"]
  y: CurveVizProps["y"]
  curve: CurveVizProps["curve"]
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

function CurveVizPlot({ x, y, curve, xMin, xMax, yMin, yMax }: PlotProps) {
  const { frame } = useVizFrame()
  const baseY = frame.plotBottom

  const conflicting = x.status === "conflicting" || y.status === "conflicting" || isBottomRange(x.value) || isBottomRange(y.value)

  const clampX = (v: number) => Math.max(xMin, Math.min(xMax, v))
  const clampY = (v: number) => Math.max(yMin, Math.min(yMax, v))

  const xRep = representative(x.value)
  const yRep = representative(y.value)
  const hasDot = !conflicting && xRep != null && yRep != null
  const dotX = xRep != null ? frame.x(clampX(xRep)) : 0
  const dotY = yRep != null ? frame.y(clampY(yRep)) : 0
  const dotPaint = svgPaint(x.status)
  const dotColor = dotPaint.stroke === "transparent" ? "var(--color-primary)" : dotPaint.stroke

  const xIsRange = !isBottomRange(x.value) && Number.isFinite(x.value.lo) && Number.isFinite(x.value.hi) && x.value.hi > x.value.lo + 1e-9
  const bandLo = xIsRange ? frame.x(clampX(x.value.lo)) : 0
  const bandHi = xIsRange ? frame.x(clampX(x.value.hi)) : 0

  return (
    <>
      <VizFrame.Grid />

      {hasDot && xIsRange && (
        <rect x={Math.min(bandLo, bandHi)} y={frame.plotTop} width={Math.max(0, Math.abs(bandHi - bandLo))} height={frame.plotBottom - frame.plotTop} fill="var(--color-primary)" fillOpacity={0.08} />
      )}

      {curve.length >= 2 && <VizFrame.Line points={curve} strokeWidth={1.5} />}

      {conflicting ? (
        <text x={frame.plotLeft + (frame.plotRight - frame.plotLeft) / 2} y={frame.plotTop + (frame.plotBottom - frame.plotTop) / 2} textAnchor="middle" dominantBaseline="central" fontSize={16} fill="var(--color-destructive)">⊥</text>
      ) : (
        hasDot && (
          <>
            <line x1={dotX} y1={dotY} x2={dotX} y2={baseY} stroke={dotColor} strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.45} />
            <line x1={frame.plotLeft} y1={dotY} x2={dotX} y2={dotY} stroke={dotColor} strokeWidth={1} strokeDasharray="2 2" strokeOpacity={0.45} />
            <VizFrame.Marker x={xRep != null ? clampX(xRep) : xMin} y={yRep != null ? clampY(yRep) : yMin} fill={dotColor} />
          </>
        )
      )}

      <text x={frame.plotLeft} y={baseY + 12} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono, ui-monospace, monospace)" fill="var(--color-muted-foreground)">{fmtNum(xMin)}</text>
      <text x={frame.plotRight} y={baseY + 12} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono, ui-monospace, monospace)" fill="var(--color-muted-foreground)">{fmtNum(xMax)}</text>
      <text x={frame.plotLeft - 4} y={baseY} textAnchor="end" dominantBaseline="central" fontSize={8} fontFamily="var(--font-mono, ui-monospace, monospace)" fill="var(--color-muted-foreground)">{fmtNum(yMin)}</text>
      <text x={frame.plotLeft - 4} y={frame.plotTop} textAnchor="end" dominantBaseline="central" fontSize={8} fontFamily="var(--font-mono, ui-monospace, monospace)" fill="var(--color-muted-foreground)">{fmtNum(yMax)}</text>
    </>
  )
}

export { CurveViz }
export type { CurveVizProps }
