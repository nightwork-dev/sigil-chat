// Pixel layout and edge routing for the roadmap canvas — the swimlane model.
//
// Pure: no React, no React Flow components, no CSS. roadmap-graph.ts decides
// STRUCTURE (which lane gates which, which row a story takes inside its lane);
// this decides GEOMETRY (where that lands on the canvas and how an edge gets
// from one card to another); roadmap-graph-view.tsx renders what both decided
// and owns interaction only. Keeping this layer separate is what lets the
// layout be tested rather than eyeballed.

import type { Edge } from "@xyflow/react"
import { MarkerType } from "@xyflow/react"

import type { RoadmapCanvas } from "./roadmap-graph"

export const STORY_WIDTH = 232
export const STORY_HEIGHT = 52
const STORY_ROW_GAP = 22
const STORY_COLUMN_GAP = 20
/** Column chrome: the header strip, and air around the cards inside. */
const PAD_X = 12
const PAD_TOP = 30
const PAD_BOTTOM = 12
const COLUMN_WIDTH = STORY_WIDTH + PAD_X * 2

/** Width of a lane holding `columns` stories side by side. */
function laneWidth(columns: number): number {
  return columns * STORY_WIDTH + (columns - 1) * STORY_COLUMN_GAP + PAD_X * 2
}
const EPIC_HEIGHT = 68
/** Air between two lanes stacked in the same depth band. */
const EPIC_ROW_GAP = 36
/**
 * Which side of a selection something sits on.
 *
 * The design system is single-hue by construction — every theme's chart tokens
 * are tints of that theme's primary — so there is no warm/cool pair to reach
 * for without inventing a colour that belongs to no theme. Direction is
 * therefore carried on the value axis the tokens actually provide: chart-1 is
 * the brightest member of the family, chart-5 the deepest, and they are the
 * most separable pair in every theme. The legend names both.
 *
 * The bright tint goes to what the selection UNLOCKS (downstream): blockers
 * already speak through the frontier red, so upstream takes the deep tint
 * rather than double-spending emphasis on what red already says (David,
 * 2026-07-31).
 */
export type ChainDirection = "upstream" | "downstream"
const UPSTREAM_COLOR = "var(--color-chart-5)"
const DOWNSTREAM_COLOR = "var(--color-chart-1)"

/** A gutter is at least this wide, and widens with the traffic through it. */
const GUTTER_BASE = 68
const GUTTER_LANE_STEP = 16
const GUTTER_MAX_LANES = 8
/** Distance a cross-lane edge runs before turning: its lane in the gutter. */
const CROSS_OFFSET = 30
/** A within-lane edge that must skip a card bows out just past the column. */
const DETOUR_OFFSET = 14
const DETOUR_STEP = 7
const DETOUR_LANES = 6

/** Handle ids. Two sides carry cross-lane traffic, two carry within-lane. */
export const HANDLE = {
  top: "t",
  bottom: "b",
  left: "l",
  right: "r",
  rightIn: "ri",
} as const

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Placement {
  epics: Map<string, Box>
  stories: Map<string, { x: number; y: number }>
  /** Which depth band each lane sits in — the x axis of the whole canvas. */
  levelOf: Map<string, number>
  /** Lane id for every node on the canvas, story or collapsed epic. */
  laneOf: Map<string, string>
  rowOf: Map<string, number>
  columnOf: Map<string, number>
}

/**
 * Swimlanes: each lane is a column, columns run left to right by dependency
 * depth, stories stack down inside their own column.
 *
 * Two axes doing two different jobs. Left to right is the EPIC-level
 * dependency order, which is shallow — a handful of bands — so the macro read
 * fits a wide screen. Top to bottom is everything else: the stories inside a
 * lane, and the lanes that tie at the same depth. That is deliberate: screens
 * are wide but wheels scroll vertically, so when a depth band holds twenty-odd
 * lanes the canvas grows DOWN rather than marching further right.
 *
 * Gutters between the columns are sized by the traffic crossing them, so a
 * dense seam gets room to separate its edges instead of braiding them.
 */
export function layoutCanvas(canvas: RoadmapCanvas): Placement {
  const levelOf = new Map(canvas.epics.map((epic) => [epic.id, epic.depth]))
  const laneOf = new Map<string, string>()
  const rowOf = new Map<string, number>()
  const columnOf = new Map<string, number>()
  for (const epic of canvas.epics) laneOf.set(epic.id, epic.id)
  for (const story of canvas.stories) {
    laneOf.set(story.id, story.epicId)
    rowOf.set(story.id, story.row)
    columnOf.set(story.id, story.column)
  }

  // Heights and the vertical stack within each band: independent of x, so this
  // can be settled before the gutters are sized.
  const heightOf = (epic: RoadmapCanvas["epics"][number]) =>
    epic.expanded
      ? epic.rows * STORY_HEIGHT +
        (epic.rows - 1) * STORY_ROW_GAP +
        PAD_TOP +
        PAD_BOTTOM
      : EPIC_HEIGHT
  const widthOf = (epic: RoadmapCanvas["epics"][number]) =>
    epic.expanded ? laneWidth(epic.columns) : STORY_WIDTH

  const bands = new Map<number, RoadmapCanvas["epics"][number][]>()
  for (const epic of canvas.epics) {
    const bucket = bands.get(epic.depth)
    if (bucket) bucket.push(epic)
    else bands.set(epic.depth, [epic])
  }

  const levels = [...bands.keys()].sort((a, b) => a - b)
  const yOf = new Map<string, number>()
  for (const level of levels) {
    let y = 0
    for (const epic of (bands.get(level) ?? [])
      .slice()
      .sort((left, right) => left.order - right.order)) {
      yOf.set(epic.id, y)
      y += heightOf(epic) + EPIC_ROW_GAP
    }
  }

  // Gutter widths, from the number of edges crossing each seam.
  const traffic = new Map<number, number>()
  for (const edge of canvas.edges) {
    const from = levelOf.get(laneOf.get(edge.source) ?? "")
    const to = levelOf.get(laneOf.get(edge.target) ?? "")
    if (from === undefined || to === undefined || to <= from) continue
    for (let seam = from; seam < to; seam += 1) {
      traffic.set(seam, (traffic.get(seam) ?? 0) + 1)
    }
  }

  // A band is as wide as its widest lane; the gutter after it scales with the
  // traffic crossing that seam. Tight inside a lane, generous between them.
  const bandWidth = new Map<number, number>()
  for (const epic of canvas.epics) {
    bandWidth.set(
      epic.depth,
      Math.max(
        bandWidth.get(epic.depth) ?? COLUMN_WIDTH,
        widthOf(epic) + PAD_X * 2,
      ),
    )
  }

  const xOf = new Map<number, number>()
  let x = 0
  for (const level of levels) {
    xOf.set(level, x)
    const lanes = Math.min(traffic.get(level) ?? 0, GUTTER_MAX_LANES)
    x +=
      (bandWidth.get(level) ?? COLUMN_WIDTH) +
      GUTTER_BASE +
      lanes * GUTTER_LANE_STEP
  }

  const epics = new Map<string, Box>()
  for (const epic of canvas.epics) {
    const left = xOf.get(epic.depth) ?? 0
    epics.set(epic.id, {
      // A folded lane is just its card, so it sits where the cards inside an
      // open lane sit: every card in a depth band shares one left edge, and
      // collapsing a lane doesn't nudge it sideways.
      x: epic.expanded ? left : left + PAD_X,
      y: yOf.get(epic.id) ?? 0,
      width: widthOf(epic),
      height: heightOf(epic),
    })
  }

  const stories = new Map<string, { x: number; y: number }>()
  for (const story of canvas.stories) {
    const box = epics.get(story.epicId)
    if (!box) continue
    stories.set(story.id, {
      x: box.x + PAD_X + story.column * (STORY_WIDTH + STORY_COLUMN_GAP),
      y: box.y + PAD_TOP + story.row * (STORY_HEIGHT + STORY_ROW_GAP),
    })
  }

  return { epics, stories, levelOf, laneOf, rowOf, columnOf }
}

/**
 * Route every edge so a single one can be followed by eye end to end.
 *
 * Three cases, and the handle each uses says which one it is. A cross-lane
 * edge leaves the right of its card, takes its own lane through the gutter,
 * and lands on the left of its target. A within-lane edge between neighbours
 * is a short hop straight down. A within-lane edge that would otherwise run
 * through the cards between its ends bows out just past the column instead.
 *
 * The gutter lane is what stops the braiding: parallel edges crossing one seam
 * get different turn distances, so their vertical runs sit side by side rather
 * than collapsing onto a shared trunk.
 */
export function routeEdges(
  canvas: RoadmapCanvas,
  place: Placement,
  chainEdges: ReadonlySet<string> | null,
  goalEdges: ReadonlySet<string> | null = null,
  chainDirection: ReadonlyMap<string, ChainDirection> | null = null,
): Edge[] {
  const yOfNode = (id: string) =>
    place.stories.get(id)?.y ?? place.epics.get(id)?.y ?? 0

  // Lane assignment per seam. Sorting by the vertical span each edge covers
  // keeps neighbouring edges in neighbouring lanes instead of interleaving.
  const crossing = canvas.edges
    .filter(
      (edge) => place.laneOf.get(edge.source) !== place.laneOf.get(edge.target),
    )
    .slice()
    .sort(
      (left, right) =>
        yOfNode(left.source) - yOfNode(right.source) ||
        yOfNode(left.target) - yOfNode(right.target) ||
        left.id.localeCompare(right.id),
    )
  const seamCount = new Map<number, number>()
  const lane = new Map<string, number>()
  for (const edge of crossing) {
    const seam = place.levelOf.get(place.laneOf.get(edge.source) ?? "") ?? 0
    const next = seamCount.get(seam) ?? 0
    lane.set(edge.id, next)
    seamCount.set(seam, next + 1)
  }

  const detourCount = new Map<string, number>()

  return canvas.edges.map((edge) => {
    const sourceLane = place.laneOf.get(edge.source)
    const targetLane = place.laneOf.get(edge.target)
    const crossLane = Boolean(
      sourceLane && targetLane && sourceLane !== targetLane,
    )
    const active = chainEdges
      ? edge.underlying.some((id) => chainEdges.has(id))
      : true
    // On the way to a pinned goal. Persistent, unlike the selection chain, and
    // the only thing on the canvas that draws in the accent colour.
    const onGoalPath = goalEdges
      ? edge.underlying.some((id) => goalEdges.has(id))
      : false

    let sourceHandle: string = HANDLE.right
    let targetHandle: string = HANDLE.left
    let offset = CROSS_OFFSET

    if (sourceLane && sourceLane === targetLane) {
      // Inside a lane the tree runs downward, so the natural route is out the
      // bottom and into the top. When the two cards do not sit in the same
      // column the run would clip whatever is between them, so it leaves
      // sideways instead — still an output port, still entering an input port.
      const sameColumn =
        place.columnOf.get(edge.source) === place.columnOf.get(edge.target)
      const adjacent =
        (place.rowOf.get(edge.target) ?? 0) -
          (place.rowOf.get(edge.source) ?? 0) ===
        1
      sourceHandle = sameColumn && adjacent ? HANDLE.bottom : HANDLE.right
      targetHandle = HANDLE.top
      const seen = detourCount.get(sourceLane) ?? 0
      detourCount.set(sourceLane, seen + 1)
      offset =
        sameColumn && adjacent
          ? STORY_ROW_GAP / 2
          : DETOUR_OFFSET + (seen % DETOUR_LANES) * DETOUR_STEP
    } else {
      // Same reasoning as the detours: the gutter is only so wide, so lanes
      // cycle within it rather than marching past the target column.
      offset =
        CROSS_OFFSET +
        ((lane.get(edge.id) ?? 0) % GUTTER_MAX_LANES) * GUTTER_LANE_STEP
    }

    const direction = chainDirection?.get(edge.id) ?? null
    const stroke = onGoalPath
      ? "var(--color-primary)"
      : direction === "upstream"
        ? UPSTREAM_COLOR
        : direction === "downstream"
          ? DOWNSTREAM_COLOR
          : active
            ? "var(--color-muted-foreground)"
            : "var(--color-border)"

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle,
      targetHandle,
      // Cross-lane links are the structural edges of the map, so they get a
      // component of their own that can carry an aggregation count on the line
      // itself. Within a lane the edge is a short hop that should stay quiet.
      type: crossLane ? "cross-lane" : "smoothstep",
      animated: false,
      pathOptions: { offset, borderRadius: 12 },
      data: {
        count: edge.count,
        stroke,
        binding: edge.binding,
        emphasis: onGoalPath || direction !== null,
        faded: !active,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: stroke,
      },
      // A satisfied dependency is history, not a live constraint — it stays
      // visible so the chain is complete, but dashed so it stops competing.
      style: {
        stroke,
        strokeWidth:
          onGoalPath || direction !== null ? 1.8 : edge.binding ? 1.4 : 1,
        strokeDasharray: edge.binding ? undefined : "4 4",
        opacity: active
          ? onGoalPath || direction !== null
            ? 0.95
            : edge.binding
              ? 0.75
              : 0.4
          : 0.15,
      },
    }
  })
}
