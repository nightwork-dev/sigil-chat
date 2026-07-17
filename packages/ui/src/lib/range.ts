// A plain [lo, hi] range — the shared shape every range-aware visualization
// (RangeSlider, RangeTrack, AreaViz, CappedBar, CurveViz, SegmentViz) takes,
// so none of them need a constraint-solving engine's interval type.

export interface Range {
  lo: number
  hi: number
}

export function isPointRange(r: Range): boolean {
  return r.lo === r.hi
}

// lo > hi reads as "no value satisfies this" (an empty/contradictory range).
export function isEmptyRange(r: Range): boolean {
  return r.lo > r.hi
}

export const fmtNum = (n: number): string =>
  n === Infinity ? "∞" : n === -Infinity ? "-∞" : Number(n.toFixed(2)).toString()

export function fmtRange(r: Range): string {
  if (isEmptyRange(r)) return "⊥"
  if (r.lo === r.hi) return fmtNum(r.lo)
  return `[${fmtNum(r.lo)}, ${fmtNum(r.hi)}]`
}
