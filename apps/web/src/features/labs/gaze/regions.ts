import type { ScreenPoint } from "./calibration"

export interface RegionRect {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

export interface RegionEvent {
  type: "enter" | "leave"
  region: string
  t: number
}

export interface RegionUpdate {
  activeRegion: string | null
  events: RegionEvent[]
}

export function grid3x3Regions(width: number, height: number): RegionRect[] {
  return Array.from({ length: 9 }, (_, index) => {
    const row = Math.floor(index / 3)
    const column = index % 3
    return {
      id: `grid-r${row}c${column}`,
      label: `${["top", "middle", "bottom"][row]} ${["left", "center", "right"][column]}`,
      x: (column * width) / 3,
      y: (row * height) / 3,
      width: width / 3,
      height: height / 3,
    }
  })
}

/** Hardcoded to the lab's visible left/main/right/composer geometry. */
export function panelRegions(width: number, height: number): RegionRect[] {
  const leftWidth = width * 0.22
  const rightStart = width * 0.78
  const composerStart = height * 0.78
  return [
    {
      id: "panel-left",
      label: "left pane",
      x: 0,
      y: 0,
      width: leftWidth,
      height,
    },
    {
      id: "panel-composer",
      label: "composer",
      x: leftWidth,
      y: composerStart,
      width: rightStart - leftWidth,
      height: height - composerStart,
    },
    {
      id: "panel-main",
      label: "main",
      x: leftWidth,
      y: 0,
      width: rightStart - leftWidth,
      height: composerStart,
    },
    {
      id: "panel-right",
      label: "right panel",
      x: rightStart,
      y: 0,
      width: width - rightStart,
      height,
    },
  ]
}

export function regionAtPoint(point: ScreenPoint, regions: RegionRect[]) {
  return (
    regions.find(
      (region) =>
        point.x >= region.x &&
        point.x <= region.x + region.width &&
        point.y >= region.y &&
        point.y <= region.y + region.height,
    ) ?? null
  )
}

function isPastBoundary(
  point: ScreenPoint,
  region: RegionRect,
  viewport: { width: number; height: number },
  margin: number,
) {
  const left = region.x === 0 ? region.x : region.x + margin
  const top = region.y === 0 ? region.y : region.y + margin
  const right =
    region.x + region.width >= viewport.width
      ? region.x + region.width
      : region.x + region.width - margin
  const bottom =
    region.y + region.height >= viewport.height
      ? region.y + region.height
      : region.y + region.height - margin
  return (
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
  )
}

export class HysteresisQuantizer {
  private activeRegion: string | null = null
  private pendingRegion: string | null = null
  private pendingSince = 0

  constructor(
    private dwellMs = 150,
    private boundaryMarginPx = 24,
  ) {}

  reset() {
    this.activeRegion = null
    this.pendingRegion = null
    this.pendingSince = 0
  }

  update(
    point: ScreenPoint,
    timeMs: number,
    regions: RegionRect[],
    viewport: { width: number; height: number },
    confident = true,
  ): RegionUpdate {
    if (!confident) {
      this.pendingRegion = null
      return { activeRegion: this.activeRegion, events: [] }
    }

    const candidate = regionAtPoint(point, regions)
    if (!candidate) return { activeRegion: this.activeRegion, events: [] }

    if (this.activeRegion === null) {
      this.activeRegion = candidate.id
      return {
        activeRegion: candidate.id,
        events: [{ type: "enter", region: candidate.id, t: timeMs }],
      }
    }

    if (candidate.id === this.activeRegion) {
      this.pendingRegion = null
      return { activeRegion: this.activeRegion, events: [] }
    }

    if (!isPastBoundary(point, candidate, viewport, this.boundaryMarginPx)) {
      this.pendingRegion = null
      return { activeRegion: this.activeRegion, events: [] }
    }

    if (this.pendingRegion !== candidate.id) {
      this.pendingRegion = candidate.id
      this.pendingSince = timeMs
      return { activeRegion: this.activeRegion, events: [] }
    }

    if (timeMs - this.pendingSince < this.dwellMs) {
      return { activeRegion: this.activeRegion, events: [] }
    }

    const previous = this.activeRegion
    this.activeRegion = candidate.id
    this.pendingRegion = null
    return {
      activeRegion: candidate.id,
      events: [
        { type: "leave", region: previous, t: timeMs },
        { type: "enter", region: candidate.id, t: timeMs },
      ],
    }
  }
}
