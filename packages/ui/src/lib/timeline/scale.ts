// Single shared time↔pixel scale. The source's timeline built d3.scaleTime()
// independently in three places (the main view, the minimap, and an
// unrelated metrics-chart overlay) with slightly different domain-
// derivation logic in each — not a bug exactly, but real duplication this
// port collapses into one utility.

import { scaleTime } from "d3"

export function createTimeScale(start: number, end: number, width: number) {
  return scaleTime()
    .domain([new Date(start), new Date(end)])
    .range([0, width])
}

export type TimeScale = ReturnType<typeof createTimeScale>
