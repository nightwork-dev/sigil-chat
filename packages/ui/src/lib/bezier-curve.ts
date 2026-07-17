// Pure types + d3 curve-function mapping, shared by bezier-curve.tsx
// (per-curve Root/Parts) and bezier-curve-editor.tsx (the Provider +
// canvas/list assembly), so neither component file imports the other.

import * as d3 from "d3"
import { createSeededRandom } from "@workspace/ui/lib/seeded-random"

export interface BezierPoint {
  x: number
  y: number
}

export type CurveType =
  | "linear"
  | "linear-closed"
  | "basis"
  | "basis-closed"
  | "basis-open"
  | "cardinal"
  | "cardinal-closed"
  | "cardinal-open"
  | "catmull-rom"
  | "catmull-rom-closed"
  | "catmull-rom-open"
  | "monotone-x"
  | "monotone-y"
  | "natural"
  | "step"
  | "step-after"
  | "step-before"

export interface BezierCurve {
  id: string
  points: BezierPoint[]
  color: string
  type: CurveType
  strokeWidth: number
}

export const CURVE_TYPE_OPTIONS: { value: CurveType; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "basis", label: "Basis" },
  { value: "cardinal", label: "Cardinal" },
  { value: "catmull-rom", label: "Catmull-Rom" },
  { value: "monotone-x", label: "Monotone X" },
  { value: "monotone-y", label: "Monotone Y" },
  { value: "natural", label: "Natural" },
  { value: "step", label: "Step" },
]

const CURVE_FUNCTIONS: Record<CurveType, d3.CurveFactory> = {
  linear: d3.curveLinear,
  "linear-closed": d3.curveLinearClosed,
  basis: d3.curveBasis,
  "basis-closed": d3.curveBasisClosed,
  "basis-open": d3.curveBasisOpen,
  cardinal: d3.curveCardinal,
  "cardinal-closed": d3.curveCardinalClosed,
  "cardinal-open": d3.curveCardinalOpen,
  "catmull-rom": d3.curveCatmullRom,
  "catmull-rom-closed": d3.curveCatmullRomClosed,
  "catmull-rom-open": d3.curveCatmullRomOpen,
  "monotone-x": d3.curveMonotoneX,
  "monotone-y": d3.curveMonotoneY,
  natural: d3.curveNatural,
  step: d3.curveStep,
  "step-after": d3.curveStepAfter,
  "step-before": d3.curveStepBefore,
}

/**
 * <input type="color"> requires a literal #rrggbb value — it silently
 * rejects any CSS custom property, hsl()/rgb() functional notation, or
 * named color. Used for generating a random new-curve color that still
 * works in that input.
 */
export function randomHexColor(): string {
  // Called from a click handler (Add Curve), not during render, so there's
  // no SSR-mismatch concern here — seeded from Date.now() rather than a
  // fixed constant so every click still gets a genuinely different color,
  // just channeled through the same seeded-PRNG utility instead of a raw
  // Math.random() call.
  const hue = Math.round(createSeededRandom(Date.now())() * 360)
  return d3.hsl(hue, 0.7, 0.55).formatHex()
}

export function generateCurvePath(curve: BezierCurve, width: number, height: number): string {
  const line = d3
    .line<BezierPoint>()
    .x((d) => d.x * width)
    .y((d) => d.y * height)
    .curve(CURVE_FUNCTIONS[curve.type] ?? d3.curveCatmullRom)
  return line(curve.points) ?? ""
}
