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
const STORY_ROW_GAP = 10
/** Column chrome: the header strip, and air around the cards inside. */
const PAD_X = 12
const PAD_TOP = 30
const PAD_BOTTOM = 12
const COLUMN_WIDTH = STORY_WIDTH + PAD_X * 2
const EPIC_HEIGHT = 68
/** Air between two lanes stacked in the same depth band. */
const EPIC_ROW_GAP = 36
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
  for (const epic of canvas.epics) laneOf.set(epic.id, epic.id)
  for (const story of canvas.stories) {
    laneOf.set(story.id, story.epicId)
    rowOf.set(story.id, story.row)
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

  const xOf = new Map<number, number>()
  let x = 0
  for (const level of levels) {
    xOf.set(level, x)
    const lanes = Math.min(traffic.get(level) ?? 0, GUTTER_MAX_LANES)
    x += COLUMN_WIDTH + GUTTER_BASE + lanes * GUTTER_LANE_STEP
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
      width: epic.expanded ? COLUMN_WIDTH : STORY_WIDTH,
      height: heightOf(epic),
    })
  }

  const stories = new Map<string, { x: number; y: number }>()
  for (const story of canvas.stories) {
    const box = epics.get(story.epicId)
    if (!box) continue
    stories.set(story.id, {
      x: box.x + PAD_X,
      y: box.y + PAD_TOP + story.row * (STORY_HEIGHT + STORY_ROW_GAP),
    })
  }

  return { epics, stories, levelOf, laneOf, rowOf }
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
): Edge[] {
  const yOfNode = (id: string) =>
    place.stories.get(id)?.y ?? place.epics.get(id)?.y ?? 0

  // Lane assignment per seam. Sorting by the vertical span each edge covers
  // keeps neighbouring edges in neighbouring lanes instead of interleaving.
  const crossing = canvas.edges
    .filter((edge) => place.laneOf.get(edge.source) !== place.laneOf.get(edge.target))
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
    const active = chainEdges
      ? edge.underlying.some((id) => chainEdges.has(id))
      : true

    let sourceHandle: string = HANDLE.right
    let targetHandle: string = HANDLE.left
    let offset = CROSS_OFFSET

    if (sourceLane && sourceLane === targetLane) {
      const from = place.rowOf.get(edge.source)
      const to = place.rowOf.get(edge.target)
      if (from !== undefined && to !== undefined && to - from === 1) {
        sourceHandle = HANDLE.bottom
        targetHandle = HANDLE.top
        offset = STORY_ROW_GAP / 2
      } else {
        // Skipping a card: hug the outside of the column rather than drawing a
        // line through the stories in between.
        const seen = detourCount.get(sourceLane) ?? 0
        detourCount.set(sourceLane, seen + 1)
        sourceHandle = HANDLE.right
        targetHandle = HANDLE.rightIn
        // Cycled, not accumulated: a lane with a dozen skips would otherwise
        // push its last detour clear across the gutter and into the next
        // column. Bounded overlap beats an edge that leaves its own lane.
        offset = DETOUR_OFFSET + (seen % DETOUR_LANES) * DETOUR_STEP
      }
    } else {
      // Same reasoning as the detours: the gutter is only so wide, so lanes
      // cycle within it rather than marching past the target column.
      offset =
        CROSS_OFFSET +
        ((lane.get(edge.id) ?? 0) % GUTTER_MAX_LANES) * GUTTER_LANE_STEP
    }

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle,
      targetHandle,
      type: "smoothstep",
      animated: false,
      pathOptions: { offset, borderRadius: 12 },
      // The count only earns ink when one line stands for several dependencies.
      ...(edge.count > 1
        ? {
            label: `×${edge.count}`,
            labelShowBg: true,
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 3,
            labelStyle: {
              fill: "var(--color-muted-foreground)",
              fontSize: 10,
            },
            labelBgStyle: { fill: "var(--color-background)" },
          }
        : {}),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: "var(--color-muted-foreground)",
      },
      // A satisfied dependency is history, not a live constraint — it stays
      // visible so the chain is complete, but dashed so it stops competing.
      style: {
        stroke: active
          ? "var(--color-muted-foreground)"
          : "var(--color-border)",
        strokeWidth: edge.binding ? 1.4 : 1,
        strokeDasharray: edge.binding ? undefined : "4 4",
        opacity: active ? (edge.binding ? 0.75 : 0.4) : 0.15,
      },
    }
  })
}

