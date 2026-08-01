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
  it("lays a lane out as a tech tree: sequence down, siblings across", () => {
    const { placement } = place(
      [
        story("A1"),
        story("A2", { deps: ["A1"] }),
        story("A3", { deps: ["A1"] }),
        story("A4", { deps: ["A2"] }),
      ],
      ["a"],
    )
    const at = (id: string) => placement.stories.get(id)!

    // A2 and A3 both unlock from A1, so they sit side by side one row down;
    // A4 unlocks from A2 and sits below that. This is what replaced the
    // single-file stack that forced internal deps into looping detours.
    expect(at("A2").y).toBeGreaterThan(at("A1").y)
    expect(at("A3").y).toBe(at("A2").y)
    expect(at("A3").x).not.toBe(at("A2").x)
    expect(at("A4").y).toBeGreaterThan(at("A2").y)

    // The container grows in both directions to hold it.
    expect(placement.epics.get("a")!.width).toBeGreaterThan(STORY_WIDTH)
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

  it("leaves sideways when a within-lane run would clip the cards between", () => {
    // A1 gates both A2 and A3, which sit side by side. A3 is not in A1's
    // column, so a straight drop would cut across A2.
    const edges = routed(
      [story("A1"), story("A2", { deps: ["A1"] }), story("A3", { deps: ["A1"] })],
      ["a"],
    )

    expect(edges.get("A1->A2")?.sourceHandle).toBe(HANDLE.bottom)
    expect(edges.get("A1->A3")?.sourceHandle).toBe(HANDLE.right)
    // Either way it enters an INPUT port. That is the convention.
    expect(edges.get("A1->A3")?.targetHandle).toBe(HANDLE.top)
  })

  it("never violates the port convention, on any edge", () => {
    const edges = routed(
      [
        story("A1", { epicId: "a" }),
        story("A2", { epicId: "a", deps: ["A1"] }),
        story("A3", { epicId: "a", deps: ["A1"] }),
        story("B1", { epicId: "b", deps: ["A2"] }),
        story("B2", { epicId: "b", deps: ["A3", "B1"] }),
      ],
      ["a", "b"],
    )

    // Inputs enter from the left or the top, outputs leave from the right or
    // the bottom — everywhere, so sequence reads one way across the canvas.
    for (const edge of edges.values()) {
      expect([HANDLE.right, HANDLE.bottom]).toContain(edge.sourceHandle)
      expect([HANDLE.left, HANDLE.top]).toContain(edge.targetHandle)
    }
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

  it("hands a collapsed lane's aggregation count to the custom edge", () => {
    const edges = routed(
      [
        story("A1", { epicId: "a" }),
        story("A2", { epicId: "a" }),
        story("B1", { epicId: "b", deps: ["A1", "A2"] }),
      ],
      ["b"],
    )
    const edge = edges.get("a->B1")

    // Cross-lane links render through their own component, which draws the
    // count as a chip ON the line rather than in React Flow's label slot.
    expect(edges.size).toBe(1)
    expect(edge?.type).toBe("cross-lane")
    expect((edge?.data as { count: number }).count).toBe(2)
  })

  it("keeps within-lane edges on the quiet built-in renderer", () => {
    const edges = routed([story("A1"), story("A2", { deps: ["A1"] })], ["a"])

    expect(edges.get("A1->A2")?.type).toBe("smoothstep")
  })
})
