"use client"

// VizFrame — the compositional Root the `viz/` family shares. Root computes
// a VizFrame (d3-scale linear scales, y-flip baked in) into context; Parts
// read it back and draw through it. d3 for the math, React for the DOM: the
// whole family renders `<path>`/`<rect>`/`<line>` JSX from pure scale/shape
// output — never `d3-selection`.
//
// Draggable Parts (Handle) reuse useBoundedVector (the interaction core) in
// its RELATIVE mode, with pixelsPerUnit derived from the frame's own
// px-per-domain-unit ratio — so a drag maps 1:1 to the frame's geometry
// without any new drag math. Handle's hit target is a strip anchored at the
// handle's current pixel position (not the whole plot box), so independent
// x and y handles over the same frame (area-viz's two edges) don't fight
// over which one a pointerdown grabs.

import { createContext, useContext, type ReactNode, type CSSProperties, type PointerEvent as ReactPointerEvent, type SVGProps } from "react"
import { cn } from "@workspace/ui/lib/utils"
import {
  areaPath,
  linePath,
  makeFrame,
  type MakeFrameOptions,
  type VizFrame as VizFrameGeometry,
} from "@workspace/ui/lib/viz-scale"
import { useBoundedVector } from "@workspace/ui/hooks/use-bounded-vector"

interface VizFrameContextValue {
  frame: VizFrameGeometry
  xDomain: [number, number]
  yDomain: [number, number]
}

const VizFrameContext = createContext<VizFrameContextValue | null>(null)

function useVizFrame(): VizFrameContextValue {
  const ctx = useContext(VizFrameContext)
  if (!ctx) throw new Error("VizFrame parts must be used inside <VizFrame.Root>")
  return ctx
}

interface RootProps {
  xDomain: [number, number]
  yDomain: [number, number]
  width: number
  height: number
  pad?: MakeFrameOptions["pad"]
  className?: string
  style?: CSSProperties
  ariaLabel?: string
  children: ReactNode
  onPointerMove?: (e: ReactPointerEvent<SVGSVGElement>) => void
  onPointerUp?: (e: ReactPointerEvent<SVGSVGElement>) => void
  onPointerCancel?: (e: ReactPointerEvent<SVGSVGElement>) => void
}

function Root({
  xDomain,
  yDomain,
  width,
  height,
  pad,
  className,
  style,
  ariaLabel,
  children,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: RootProps) {
  const frame = makeFrame({ xDomain, yDomain, width, height, pad })
  return (
    <VizFrameContext.Provider value={{ frame, xDomain, yDomain }}>
      <svg
        data-slot="viz-frame"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={cn("max-w-full", className)}
        style={{ height: "auto", ...style }}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {children}
      </svg>
    </VizFrameContext.Provider>
  )
}

interface GridProps {
  /** Draw the left (y) axis line. Default true. */
  axisY?: boolean
  /** Draw the bottom (x) axis line. Default true. */
  axisX?: boolean
  stroke?: string
  className?: string
}

/** The plain L-shaped axis lines most viz components draw as a baseline. */
function Grid({ axisY = true, axisX = true, stroke = "var(--color-border)" }: GridProps) {
  const { frame } = useVizFrame()
  return (
    <g data-slot="viz-frame-grid">
      {axisY && (
        <line x1={frame.plotLeft} y1={frame.plotTop} x2={frame.plotLeft} y2={frame.plotBottom} stroke={stroke} strokeWidth={1} />
      )}
      {axisX && (
        <line x1={frame.plotLeft} y1={frame.plotBottom} x2={frame.plotRight} y2={frame.plotBottom} stroke={stroke} strokeWidth={1} />
      )}
    </g>
  )
}

interface AreaProps {
  points: ReadonlyArray<readonly [number, number]>
  baseline?: number
  fill?: string
  fillOpacity?: number
  className?: string
}

/** A `d3-shape` area path drawn through the frame. */
function Area({ points, baseline, fill = "var(--color-primary)", fillOpacity = 0.15, className }: AreaProps) {
  const { frame } = useVizFrame()
  return <path data-slot="viz-frame-area" d={areaPath(points, frame, baseline)} fill={fill} fillOpacity={fillOpacity} stroke="none" className={className} />
}

interface LineProps {
  points: ReadonlyArray<readonly [number, number]>
  stroke?: string
  strokeWidth?: number
  className?: string
}

/** A `d3-shape` line path drawn through the frame. */
function Line({ points, stroke = "var(--color-primary)", strokeWidth = 1.5, className }: LineProps) {
  const { frame } = useVizFrame()
  return (
    <path
      data-slot="viz-frame-line"
      d={linePath(points, frame)}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
    />
  )
}

interface MarkerProps {
  x: number
  y: number
  r?: number
  fill?: string
  className?: string
}

/** A single point marker (dot) at a data (x, y), drawn through the frame. */
function Marker({ x, y, r = 3.5, fill = "var(--color-primary)", className }: MarkerProps) {
  const { frame } = useVizFrame()
  return <circle data-slot="viz-frame-marker" cx={frame.x(x)} cy={frame.y(y)} r={r} fill={fill} className={className} />
}

interface HandleProps {
  /** Which axis this handle drags along. */
  axis: "x" | "y"
  /** Current value in domain units. */
  value: number
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  /** Hit-strip half-width in px (perpendicular to the drag axis). Default 7 (14px strip). */
  hitHalfWidth?: number
  cursor?: string
  disabled?: boolean
  className?: string
  /** Visual for the handle — rendered inside the hit target, positioned by the caller using the same frame. */
  children?: ReactNode
}

/**
 * A draggable Part. Reuses useBoundedVector in RELATIVE mode: pixelsPerUnit
 * is the frame's own px-per-domain-unit ratio for this axis, so dragging N
 * pixels always moves the value by exactly the same amount the frame would
 * plot it at — no new drag math, just frame-derived geometry fed into the
 * existing interaction core.
 */
function Handle({ axis, value, onChange, onCommit, hitHalfWidth = 7, cursor, disabled, className, children }: HandleProps) {
  const { frame, xDomain, yDomain } = useVizFrame()
  const domain = axis === "x" ? xDomain : yDomain
  const domainSpan = domain[1] - domain[0]
  const plotSpan = axis === "x" ? frame.plotRight - frame.plotLeft : frame.plotBottom - frame.plotTop
  const pixelsPerUnit = domainSpan !== 0 ? plotSpan / domainSpan : 1

  const { targetProps } = useBoundedVector({
    axes: [{ min: domain[0], max: domain[1] }],
    value: [value],
    onChange: (next) => onChange(next[0]!),
    onCommit: onCommit ? (next) => onCommit(next[0]!) : undefined,
    mapping: { mode: "relative", axis, pixelsPerUnit, invert: axis === "y" },
    disabled,
  })
  const { style: hitStyle, ...restTargetProps } = targetProps

  const hitProps =
    axis === "x"
      ? {
          x: frame.x(value) - hitHalfWidth,
          y: frame.plotTop,
          width: hitHalfWidth * 2,
          height: Math.max(0, frame.plotBottom - frame.plotTop),
        }
      : {
          x: frame.plotLeft,
          y: frame.y(value) - hitHalfWidth,
          width: Math.max(0, frame.plotRight - frame.plotLeft),
          height: hitHalfWidth * 2,
        }

  // Focus indicator geometry: a small rounded outline AT the handle position,
  // not around the full-plot-height transparent hit strip. Shown only on
  // keyboard focus (peer-focus-visible), so focus reads clearly without a
  // bright halo smeared over invisible space (the default outline is killed
  // with outline-none on the hit target).
  const focusRing =
    axis === "x"
      ? { x: frame.x(value) - 6, y: (frame.plotTop + frame.plotBottom) / 2 - 15, width: 12, height: 30, rx: 6 }
      : { x: (frame.plotLeft + frame.plotRight) / 2 - 15, y: frame.y(value) - 6, width: 30, height: 12, rx: 6 }

  return (
    <g data-slot="viz-frame-handle" className={className}>
      <rect
        {...hitProps}
        fill="transparent"
        className="peer outline-none"
        style={{ ...hitStyle, cursor: cursor ?? (axis === "x" ? "ew-resize" : "ns-resize") }}
        {...(restTargetProps as unknown as SVGProps<SVGRectElement>)}
      />
      {children}
      <rect
        {...focusRing}
        aria-hidden
        fill="none"
        stroke="var(--color-ring)"
        strokeWidth={1.5}
        className="pointer-events-none opacity-0 transition-opacity peer-focus-visible:opacity-100"
      />
    </g>
  )
}

export { useVizFrame }

const VizFrame = { Root, Grid, Area, Line, Marker, Handle }
export { VizFrame }
