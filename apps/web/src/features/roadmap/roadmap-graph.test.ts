import { describe, expect, it } from "vitest"

import {
  blockingChain,
  buildRoadmapEpicGraph,
  buildRoadmapGraph,
  rollupStatus,
  type RoadmapGraphStory,
  type StoryStatus,
} from "./roadmap-graph"

function story(
  id: string,
  over: Partial<RoadmapGraphStory> = {},
): RoadmapGraphStory {
  return {
    id,
    title: id,
    status: "ready",
    epicId: "track-a",
    epicTitle: "Track A",
    deps: [],
    ...over,
  }
}

// The acceptance fixture from SC.15: the live memory-lane chain.
// WGS.1 gates MEM.5, MEM.5 gates the game migration, and MEM.4 / MEM.6 /
// REL.1 / EMB.1 hang off it.
const MEMORY_LANE: RoadmapGraphStory[] = [
  story("WGS.1", { status: "in-progress", epicId: "track-wgs", epicTitle: "Worldgen substrate" }),
  story("MEM.5", { status: "blocked", epicId: "track-mem", epicTitle: "Memory", deps: ["WGS.1"] }),
  story("MIG.1", { title: "Game migration", status: "idea", epicId: "track-game", epicTitle: "Game", deps: ["MEM.5"] }),
  story("MEM.4", { status: "ready", epicId: "track-mem", epicTitle: "Memory", deps: ["MEM.5"] }),
  story("MEM.6", { status: "idea", epicId: "track-mem", epicTitle: "Memory", deps: ["MEM.5"] }),
  story("REL.1", { status: "idea", epicId: "track-rel", epicTitle: "Relationships", deps: ["MEM.5"] }),
  story("EMB.1", { status: "spec", epicId: "track-emb", epicTitle: "Embeddings", deps: ["MEM.5"] }),
]

describe("dependency direction and depth", () => {
  it("runs edges blocker -> blocked so blockers sit upstream", () => {
    const graph = buildRoadmapGraph(MEMORY_LANE)

    expect(graph.edges).toContainEqual({
      id: "WGS.1->MEM.5",
      source: "WGS.1",
      target: "MEM.5",
      binding: true,
    })
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))
    expect(byId.get("WGS.1")?.depth).toBe(0)
    expect(byId.get("MEM.5")?.depth).toBe(1)
    expect(byId.get("MIG.1")?.depth).toBe(2)
  })

  it("derives blocked from the chain, not from the authored status", () => {
    const byId = new Map(
      buildRoadmapGraph(MEMORY_LANE).nodes.map((node) => [node.id, node]),
    )
    // MEM.4 is authored "ready" but its blocker is unshipped.
    expect(byId.get("MEM.4")?.status).toBe("ready")
    expect(byId.get("MEM.4")?.isBlocked).toBe(true)
    expect(byId.get("WGS.1")?.isBlocked).toBe(false)
  })

  it("marks an edge non-binding once its blocker ships", () => {
    const graph = buildRoadmapGraph([
      story("A", { status: "shipped" }),
      story("B", { deps: ["A"] }),
    ])

    expect(graph.edges[0]?.binding).toBe(false)
    expect(graph.nodes.find((node) => node.id === "B")?.isBlocked).toBe(false)
  })

  it("keeps the graph standing when deps name something absent", () => {
    const graph = buildRoadmapGraph([story("B", { deps: ["GONE", "B"] })])

    expect(graph.danglingDeps).toEqual(["GONE"])
    expect(graph.edges).toEqual([])
    expect(graph.nodes).toHaveLength(1)
  })

  it("survives an authored cycle instead of hanging", () => {
    const graph = buildRoadmapGraph([
      story("A", { deps: ["C"] }),
      story("B", { deps: ["A"] }),
      story("C", { deps: ["B"] }),
    ])

    expect(graph.nodes).toHaveLength(3)
    expect(graph.nodes.every((node) => Number.isInteger(node.depth))).toBe(true)
  })
})

describe("blocking chain (acceptance criterion 2)", () => {
  it("lights the whole chain through MEM.5 in one selection", () => {
    const graph = buildRoadmapGraph(MEMORY_LANE)
    const chain = blockingChain(graph, "MEM.5")

    expect(chain.upstream).toEqual(["WGS.1"])
    expect([...chain.downstream].sort()).toEqual([
      "EMB.1",
      "MEM.4",
      "MEM.6",
      "MIG.1",
      "REL.1",
    ])
    // Everything on the chain, and nothing off it.
    expect(chain.highlighted.size).toBe(7)
    expect(chain.edges.has("WGS.1->MEM.5")).toBe(true)
    expect(chain.edges.has("MEM.5->MIG.1")).toBe(true)
  })

  it("reaches transitively from the root of the chain", () => {
    const chain = blockingChain(buildRoadmapGraph(MEMORY_LANE), "WGS.1")

    expect(chain.upstream).toEqual([])
    expect(chain.downstream).toContain("MIG.1")
    expect(chain.downstream).toContain("EMB.1")
  })

  it("returns an empty chain for an unknown id", () => {
    const chain = blockingChain(buildRoadmapGraph(MEMORY_LANE), "NOPE")
    expect(chain.highlighted.size).toBe(0)
  })
})

describe("collapsing shipped work", () => {
  it("hides finished stories but keeps ones that still gate live work", () => {
    const stories = [
      story("DONE", { status: "shipped" }),
      story("STILL-GATES", { status: "shipped" }),
      story("LIVE", { deps: ["STILL-GATES"] }),
    ]

    const graph = buildRoadmapGraph(stories, { collapseShipped: true })
    const ids = graph.nodes.map((node) => node.id).sort()

    // Dropping STILL-GATES would make LIVE look like it depends on nothing.
    expect(ids).toEqual(["LIVE", "STILL-GATES"])
  })

  it("keeps every story when not collapsing", () => {
    const graph = buildRoadmapGraph(
      [story("DONE", { status: "shipped" }), story("LIVE")],
      { collapseShipped: false },
    )
    expect(graph.nodes).toHaveLength(2)
  })

  it("counts the dependencies a collapse hid, in both directions", () => {
    // MID is shipped but survives the collapse because it still gates LIVE.
    // Its own blocker ROOT and its other dependent SIDE are shipped dead ends,
    // so both leave the canvas — one on each side of MID.
    const stories = [
      story("ROOT", { status: "shipped" }),
      story("MID", { status: "shipped", deps: ["ROOT"] }),
      story("LIVE", { deps: ["MID"] }),
      story("SIDE", { status: "shipped", deps: ["MID"] }),
    ]

    const collapsed = buildRoadmapGraph(stories, { collapseShipped: true })
    const byId = new Map(collapsed.nodes.map((node) => [node.id, node]))

    expect([...byId.keys()].sort()).toEqual(["LIVE", "MID"])
    expect(byId.get("MID")?.hiddenBlockers).toBe(1)
    expect(byId.get("MID")?.hiddenBlocked).toBe(1)
    expect(byId.get("LIVE")?.hiddenBlockers).toBe(0)
  })

  it("reports nothing hidden when every dependency is on the canvas", () => {
    const graph = buildRoadmapGraph([story("A"), story("B", { deps: ["A"] })])
    for (const node of graph.nodes) {
      expect(node.hiddenBlockers).toBe(0)
      expect(node.hiddenBlocked).toBe(0)
    }
  })
})

describe("epic rollup and clustering", () => {
  it("reads an epic as its most urgent unfinished story", () => {
    const counts = (over: Partial<Record<StoryStatus, number>>) => ({
      idea: 0, spec: 0, ready: 0, "in-progress": 0, verify: 0, shipped: 0, blocked: 0,
      ...over,
    })

    expect(rollupStatus(counts({ blocked: 1, "in-progress": 3 }))).toBe("blocked")
    expect(rollupStatus(counts({ "in-progress": 1, idea: 5 }))).toBe("in-progress")
    expect(rollupStatus(counts({ shipped: 4 }))).toBe("shipped")
    expect(rollupStatus(counts({ idea: 1, shipped: 9 }))).toBe("idea")
  })

  it("groups stories of one epic into adjacent lanes in a column", () => {
    const graph = buildRoadmapGraph([
      story("A1", { epicId: "a", deps: [] }),
      story("B1", { epicId: "b", deps: [] }),
      story("A2", { epicId: "a", deps: [] }),
    ])
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))

    // Same column; the two "a" stories take adjacent rows.
    expect(byId.get("A1")?.depth).toBe(0)
    const aLanes = [byId.get("A1")!.lane, byId.get("A2")!.lane].sort()
    expect(Math.abs(aLanes[1]! - aLanes[0]!)).toBe(1)
  })

  it("orders epic bands by where their blockers sit, not alphabetically", () => {
    // Column 0 is alphabetical: a=row 0, b=row 1, c=row 2. In column 1, epic
    // "p" hangs off the BOTTOM of column 0 and epic "q" off the top, so
    // alphabetical order would drag every edge across the column.
    const graph = buildRoadmapGraph([
      story("A1", { epicId: "a" }),
      story("B1", { epicId: "b" }),
      story("C1", { epicId: "c" }),
      story("P1", { epicId: "p", deps: ["C1"] }),
      story("P2", { epicId: "p", deps: ["C1"] }),
      story("Q1", { epicId: "q", deps: ["A1"] }),
    ])
    const byId = new Map(graph.nodes.map((node) => [node.id, node]))

    expect(byId.get("Q1")!.lane).toBeLessThan(byId.get("P1")!.lane)
    // The band still holds together: p's two stories stay adjacent.
    expect(Math.abs(byId.get("P1")!.lane - byId.get("P2")!.lane)).toBe(1)
  })
})

describe("epic-level distillation (acceptance criterion 3)", () => {
  it("answers what gates what across lanes without opening stories", () => {
    const epicGraph = buildRoadmapEpicGraph(buildRoadmapGraph(MEMORY_LANE))
    const ids = epicGraph.edges.map((edge) => edge.id).sort()

    expect(ids).toEqual([
      "track-mem->track-emb",
      "track-mem->track-game",
      "track-mem->track-rel",
      "track-wgs->track-mem",
    ])
    const memory = epicGraph.nodes.find((node) => node.id === "track-mem")
    expect(memory?.status).toBe("blocked")
    expect(memory?.depth).toBe(1)
    expect(
      epicGraph.nodes.find((node) => node.id === "track-wgs")?.depth,
    ).toBe(0)
  })

  it("collapses many story edges between two epics into one", () => {
    const epicGraph = buildRoadmapEpicGraph(
      buildRoadmapGraph([
        story("A1", { epicId: "a", status: "shipped" }),
        story("A2", { epicId: "a" }),
        story("B1", { epicId: "b", deps: ["A1", "A2"] }),
      ]),
    )

    expect(epicGraph.edges).toHaveLength(1)
    // Still binding because A2 has not shipped.
    expect(epicGraph.edges[0]?.binding).toBe(true)
  })

  it("ignores dependencies internal to one epic", () => {
    const epicGraph = buildRoadmapEpicGraph(
      buildRoadmapGraph([story("A1", { epicId: "a" }), story("A2", { epicId: "a", deps: ["A1"] })]),
    )
    expect(epicGraph.edges).toEqual([])
  })
})
