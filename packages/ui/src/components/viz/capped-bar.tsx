// CappedBar — an actual picture of `y = clamp(x, lo, hi)`. Two stacked
// tracks on a shared [0, max] domain: the top carries x (free to roam), the
// bottom carries y (forced to live inside [lo, hi]). The band is highlighted
// with hard "wall" lines at lo and hi — when x runs past hi, y stops dead at
// the wall, so you watch the marker pile up against the rail it can't cross.

import { cn } from "@workspace/ui/lib/utils"
import { isPointRange, fmtNum, fmtRange, type Range } from "@workspace/ui/lib/range"
import { svgPaint, type ValueStatus } from "@workspace/ui/lib/value-status"
import { makeFrame } from "@workspace/ui/lib/viz-scale"

interface CappedBarProps {
  x: { value: Range; status: ValueStatus }
  y: { value: Range; status: ValueStatus }
  lo: number
  hi: number
  max: number
  className?: string
}

const isBottomRange = (r: Range) => r.lo > r.hi

const PAD_L = 10
const PAD_R = 10
const PAD_T = 22
const PAD_B = 22
const W = 240
const TRACK_H = 12
const TRACK_GAP = 36

function CappedBar({ x, y, lo, hi, max, className }: CappedBarProps) {
  // CappedBar is one horizontal domain drawn across two stacked rows — the
  // rows are fixed layout (xTrackY/yTrackY below), not a second data
  // dimension, so only the frame's x-scale is used here (no y-domain, no
  // VizFrame.Root/context — there's nothing compositional or draggable to
  // share). The x-scale itself is the deduped math: same makeFrame() Layer 1
  // helper area-viz and curve-viz use, in place of a private linear map.
  const frame = makeFrame({ xDomain: [0, max], yDomain: [0, 1], width: PAD_L + W + PAD_R, height: 1, pad: { left: PAD_L, right: PAD_R } })
  const px = frame.x

  const xPaint = svgPaint(x.status)
  const yPaint = svgPaint(y.status)

  const xBottom = isBottomRange(x.value)
  const yBottom = isBottomRange(y.value)

  const xLo = px(Number.isFinite(x.value.lo) ? x.value.lo : 0)
  const xHi = px(Number.isFinite(x.value.hi) ? x.value.hi : max)
  const xIsRange = !isPointRange(x.value) && !xBottom

  const yLo = px(Number.isFinite(y.value.lo) ? y.value.lo : 0)
  const yHi = px(Number.isFinite(y.value.hi) ? y.value.hi : max)
  const yIsRange = !isPointRange(y.value) && !yBottom

  const loX = px(lo)
  const hiX = px(hi)

  const xTrackY = PAD_T
  const yTrackY = PAD_T + TRACK_GAP

  const vbW = PAD_L + W + PAD_R
  const vbH = yTrackY + TRACK_H + PAD_B

  const mono = "var(--font-mono, ui-monospace, monospace)"

  return (
    <div data-slot="capped-bar" className={cn("flex justify-center", className)}>
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width={vbW}
        height={vbH}
        className="max-w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label={`y = clamp(x, ${fmtNum(lo)}, ${fmtNum(hi)}); x ${fmtRange(x.value)}, y ${fmtRange(y.value)}`}
      >
        <text x={PAD_L} y={xTrackY - 6} fontSize={9} fontFamily={mono} fill="var(--color-muted-foreground)">x</text>
        <rect x={PAD_L} y={xTrackY} width={W} height={TRACK_H} rx={3} fill="var(--color-muted)" />
        {!xBottom &&
          (xIsRange ? (
            <rect x={Math.min(xLo, xHi)} y={xTrackY} width={Math.max(2, Math.abs(xHi - xLo))} height={TRACK_H} rx={3} fill={xPaint.fill} fillOpacity={xPaint.fillOpacity} stroke={xPaint.stroke} strokeOpacity={xPaint.strokeOpacity} strokeDasharray={xPaint.dashed ? "3 2" : undefined} />
          ) : (
            <line x1={xLo} y1={xTrackY - 2} x2={xLo} y2={xTrackY + TRACK_H + 2} stroke={xPaint.stroke} strokeOpacity={xPaint.strokeOpacity} strokeWidth={2.5} />
          ))}

        <rect x={loX} y={xTrackY} width={Math.max(0, hiX - loX)} height={yTrackY + TRACK_H - xTrackY} fill="var(--color-primary)" fillOpacity={0.06} />
        <line x1={loX} y1={xTrackY - 4} x2={loX} y2={yTrackY + TRACK_H + 4} stroke="var(--color-primary)" strokeOpacity={0.6} strokeWidth={1.5} />
        <line x1={hiX} y1={xTrackY - 4} x2={hiX} y2={yTrackY + TRACK_H + 4} stroke="var(--color-primary)" strokeOpacity={0.6} strokeWidth={1.5} />

        <text x={PAD_L} y={yTrackY - 6} fontSize={9} fontFamily={mono} fill="var(--color-muted-foreground)">y</text>
        <rect x={PAD_L} y={yTrackY} width={W} height={TRACK_H} rx={3} fill="var(--color-muted)" />
        {!yBottom &&
          (yIsRange ? (
            <rect x={Math.min(yLo, yHi)} y={yTrackY} width={Math.max(2, Math.abs(yHi - yLo))} height={TRACK_H} rx={3} fill={yPaint.fill} fillOpacity={yPaint.fillOpacity} stroke={yPaint.stroke} strokeOpacity={yPaint.strokeOpacity} strokeDasharray={yPaint.dashed ? "3 2" : undefined} />
          ) : (
            <line x1={yLo} y1={yTrackY - 2} x2={yLo} y2={yTrackY + TRACK_H + 2} stroke={yPaint.stroke} strokeOpacity={yPaint.strokeOpacity} strokeWidth={2.5} />
          ))}

        <text x={PAD_L + W} y={xTrackY - 6} textAnchor="end" fontSize={9} fontFamily={mono} fill={xBottom ? "var(--color-destructive)" : xPaint.label}>
          {fmtRange(x.value)}
        </text>
        <text x={PAD_L + W} y={yTrackY - 6} textAnchor="end" fontSize={9} fontFamily={mono} fill={yBottom ? "var(--color-destructive)" : yPaint.label}>
          {fmtRange(y.value)}
        </text>
        <text x={loX} y={yTrackY + TRACK_H + 12} textAnchor="middle" fontSize={8} fontFamily={mono} fill="var(--color-muted-foreground)">{fmtNum(lo)}</text>
        <text x={hiX} y={yTrackY + TRACK_H + 12} textAnchor="middle" fontSize={8} fontFamily={mono} fill="var(--color-muted-foreground)">{fmtNum(hi)}</text>
      </svg>
    </div>
  )
}

export { CappedBar }
export type { CappedBarProps }
