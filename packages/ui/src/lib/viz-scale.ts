// Viz geometry core — Layer 1, pure math, no React/DOM.
//
// d3 for the MATH, React for the DOM: this module uses `d3-scale` +
// `d3-shape` as pure functions only (value -> coord, points -> path string).
// It never touches `d3-selection` — no `d3.select().append()` anywhere in
// this file or its consumers. Scales and shape generators are pure and
// SSR-safe; selection is neither.
//
// A VizFrame is a small pixel-space contract: two linear scales mapping
// data domains to a padded pixel box, with the y-flip (data-up ->
// pixel-down) baked into the scale itself so callers never invert by hand.

import { scaleLinear } from "d3-scale"
import { area as d3Area, line as d3Line } from "d3-shape"

export interface VizFramePadding {
  left?: number
  top?: number
  right?: number
  bottom?: number
}

export interface MakeFrameOptions {
  xDomain: [number, number]
  yDomain: [number, number]
  width: number
  height: number
  /** Uniform padding (applied to all four sides), or per-side overrides. */
  pad?: number | VizFramePadding
}

export interface VizFrame {
  /** Data x -> pixel x. */
  x: (v: number) => number
  /** Data y -> pixel y (y-flip baked in: larger y is higher on screen). */
  y: (v: number) => number
  width: number
  height: number
  /** Padded plot bounds in pixel space — for axis lines, grid, and hit targets. */
  plotLeft: number
  plotRight: number
  plotTop: number
  plotBottom: number
}

function normalizePad(pad: MakeFrameOptions["pad"]): Required<VizFramePadding> {
  if (pad === undefined) return { left: 0, top: 0, right: 0, bottom: 0 }
  if (typeof pad === "number") return { left: pad, top: pad, right: pad, bottom: pad }
  return { left: pad.left ?? 0, top: pad.top ?? 0, right: pad.right ?? 0, bottom: pad.bottom ?? 0 }
}

/**
 * A linear map from `domain` to `range`, degenerate-domain safe: when
 * domain[0] === domain[1] there is no meaningful slope, so every input maps
 * to the midpoint of `range` instead of producing NaN (d3's own scaleLinear
 * divides by the zero domain span).
 */
function safeLinear(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain
  if (d0 === d1) {
    const mid = (range[0] + range[1]) / 2
    return () => mid
  }
  const scale = scaleLinear().domain(domain).range(range)
  return (v: number) => scale(v)
}

export function makeFrame(opts: MakeFrameOptions): VizFrame {
  const pad = normalizePad(opts.pad)
  const plotLeft = pad.left
  const plotRight = Math.max(plotLeft, opts.width - pad.right)
  const plotTop = pad.top
  const plotBottom = Math.max(plotTop, opts.height - pad.bottom)

  const x = safeLinear(opts.xDomain, [plotLeft, plotRight])
  // y-flip baked in: the range is reversed (bottom -> top) so larger data-y
  // values land at smaller pixel-y (higher on screen).
  const y = safeLinear(opts.yDomain, [plotBottom, plotTop])

  return { x, y, width: opts.width, height: opts.height, plotLeft, plotRight, plotTop, plotBottom }
}

/** A data point in domain space, mapped through a VizFrame to an SVG path. */
export type VizPoint = readonly [number, number]

/** A `d3-shape` line generator, pre-wired to `frame`. Empty input -> "". */
export function linePath(pts: ReadonlyArray<VizPoint>, frame: VizFrame): string {
  if (pts.length === 0) return ""
  const gen = d3Line<VizPoint>()
    .x((d) => frame.x(d[0]))
    .y((d) => frame.y(d[1]))
  return gen(pts as VizPoint[]) ?? ""
}

/**
 * A `d3-shape` area generator, pre-wired to `frame`. `baseline` is a Y value
 * in DATA space (default 0) that the area is filled down to. Empty input -> "".
 */
export function areaPath(pts: ReadonlyArray<VizPoint>, frame: VizFrame, baseline = 0): string {
  if (pts.length === 0) return ""
  const y0 = frame.y(baseline)
  const gen = d3Area<VizPoint>()
    .x((d) => frame.x(d[0]))
    .y1((d) => frame.y(d[1]))
    .y0(y0)
  return gen(pts as VizPoint[]) ?? ""
}
