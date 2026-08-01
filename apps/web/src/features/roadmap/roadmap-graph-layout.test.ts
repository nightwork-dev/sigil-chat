import { describe, expect, it } from "vitest"

import { buildRoadmapCanvas, buildRoadmapGraph } from "./roadmap-graph"
import type { RoadmapGraphStory } from "./roadmap-graph"
import { HANDLE, layoutCanvas, routeEdges, STORY_WIDTH } from "./roadmap-graph-layout"

function story(
  id: string,
  over: Partial<RoadmapGraphStory> = {},
): RoadmapGraphStory {
  return {
    id,
    title: id,
    status: "ready",
    epicId: "a",
    epicTitle: "Lane A",
    deps: [],
    ...over,
  }
}

function place(stories: RoadmapGraphStory[], expanded: string[]) {
  const canvas = buildRoadmapCanvas(buildRoadmapGraph(stories), {
    expandedEpics: new Set(expanded),
  })
  return { canvas, placement: layoutCanvas(canvas) }
}

describe("swimlane geometry", () => {
  it("gives each lane one column, one card wide", () => {
    const { placement } = place(
      [story("A1"), story("A2"), story("A3")],
      ["a"],
    )
    const positions = ["A1", "A2", "A3"].map((id) => placement.stories.get(id)!)

    // One column: every story in the lane shares an x, and they stack down.
    expect(new Set(positions.map((at) => at.x)).size).toBe(1)
    expect(positions[0]!.y).toBeLessThan(positions[1]!.y)
    expect(positions[1]!.y).toBeLessThan(positions[2]!.y)
    expect(placement.epics.get("a")?.width).toBeLessThanOrEqual(
      STORY_WIDTH + 24,
    )
  })

  it("stacks lanes that tie at one depth instead of marching right", () => {
    const { placement } = place(
      [
        story("A1", { epicId: "a" }),
        story("B1", { epicId: "b" }),
        story("C1", { epicId: "c" }),
      ],
      [],
    )
    const boxes = ["a", "b", "c"].map((id) => placement.epics.get(id)!)

    // This is the whole "less aggressively horizontal" requirement: lanes at
    // the same depth share a column position and grow the canvas downward.
    expect(new Set(boxes.map((box) => box.x)).size).toBe(1)
    expect(new Set(boxes.map((box) => box.y)).size).toBe(3)
  })

  it("puts a gated lane to the right of the lane gating it", () => {
    const { placement } = place(
      [story("A1", { epicId: "a" }), story("B1", { epicId: "b", deps: ["A1"] })],
      [],
    )

    expect(placement.epics.get("b")!.x).toBeGreaterThan(
      placement.epics.get("a")!.x,
    )
  })

  it("widens a gutter that more edges have to cross", () => {
    const thin = place(
      [story("A1", { epicId: "a" }), story("B1", { epicId: "b", deps: ["A1"] })],
      ["a", "b"],
    )
    const thick = place(
      [
        story("A1", { epicId: "a" }),
        story("A2", { epicId: "a" }),
        story("A3", { epicId: "a" }),
        story("B1", { epicId: "b", deps: ["A1"] }),
        story("B2", { epicId: "b", deps: ["A2"] }),
        story("B3", { epicId: "b", deps: ["A3"] }),
      ],
      ["a", "b"],
    )

    const gap = (result: typeof thin) =>
      result.placement.epics.get("b")!.x - result.placement.epics.get("a")!.x

    // A dense seam needs room to separate its edges rather than braid them.
    expect(gap(thick)).toBeGreaterThan(gap(thin))
  })
})

describe("edge routing", () => {
  type RoutedEdge = ReturnType<typeof routeEdges>[number] & {
    pathOptions?: { offset: number }
  }

  const routed = (stories: RoadmapGraphStory[], expanded: string[]) => {
    const { canvas, placement } = place(stories, expanded)
    return new Map<string, RoutedEdge>(
      routeEdges(canvas, placement, null).map((edge) => [
        edge.id,
        edge as RoutedEdge,
      ]),
    )
  }

  it("sends a cross-lane edge out the right and into the left", () => {
    const edges = routed(
      [story("A1", { epicId: "a" }), story("B1", { epicId: "b", deps: ["A1"] })],
      ["a", "b"],
    )
    const edge = edges.get("A1->B1")

    expect(edge?.sourceHandle).toBe(HANDLE.right)
    expect(edge?.targetHandle).toBe(HANDLE.left)
  })

  it("drops a short hop straight down between neighbours in a lane", () => {
    const edges = routed(
      [story("A1"), story("A2", { deps: ["A1"] })],
      ["a"],
    )
    const edge = edges.get("A1->A2")

    expect(edge?.sourceHandle).toBe(HANDLE.bottom)
    expect(edge?.targetHandle).toBe(HANDLE.top)
  })

  it("bows a within-lane edge outside the column rather than through cards", () => {
    // A1 gates A3, and A2 sits between them: a straight vertical line would be
    // drawn through A2's card.
    const edges = routed(
      [story("A1"), story("A2", { deps: ["A1"] }), story("A3", { deps: ["A1"] })],
      ["a"],
    )
    const edge = edges.get("A1->A3")

    expect(edge?.sourceHandle).toBe(HANDLE.right)
    expect(edge?.targetHandle).toBe(HANDLE.rightIn)
  })

  it("gives parallel edges crossing one seam their own lane in the gutter", () => {
    const edges = routed(
      [
        story("A1", { epicId: "a" }),
        story("A2", { epicId: "a" }),
        story("A3", { epicId: "a" }),
        story("B1", { epicId: "b", deps: ["A1"] }),
        story("B2", { epicId: "b", deps: ["A2"] }),
        story("B3", { epicId: "b", deps: ["A3"] }),
      ],
      ["a", "b"],
    )
    const offsets = ["A1->B1", "A2->B2", "A3->B3"].map(
      (id) => edges.get(id)?.pathOptions?.offset,
    )

    // The acceptance bar for edges: three parallel runs through one gutter must
    // turn at three different distances, or they collapse into one trunk and
    // stop being individually followable.
    expect(new Set(offsets).size).toBe(3)
  })

  it("keeps an aggregated edge's label and count when a lane is collapsed", () => {
    const edges = routed(
      [
        story("A1", { epicId: "a" }),
        story("A2", { epicId: "a" }),
        story("B1", { epicId: "b", deps: ["A1", "A2"] }),
      ],
      ["b"],
    )

    expect(edges.size).toBe(1)
    expect(edges.get("a->B1")?.label).toBe("×2")
  })
})
