// Projection from the roadmap store's stories to a dependency graph.
//
// Pure and store-shaped-in, display-shaped-out: no React, no layout library,
// no fetching. Everything the canvas needs — node placement, edge direction,
// epic clustering, rollup status, the blocking chain of a selection — is
// decided here so it can be tested against the real chains David cares about
// rather than eyeballed on a canvas.
//
// Direction convention, fixed once: an edge runs BLOCKER → BLOCKED. A story's
// `deps` name the things that gate it, so `MEM.5.deps = ["WGS.1"]` becomes
// `WGS.1 → MEM.5`. Blockers are therefore upstream (left/above) and the arrow
// points the way work flows, which is the reading David asked for.

export type StoryStatus =
  | "idea"
  | "spec"
  | "ready"
  | "in-progress"
  | "verify"
  | "shipped"
  | "blocked"

/** The subset of the store's `Story` this view needs. */
export interface RoadmapGraphStory {
  id: string
  title: string
  status: StoryStatus
  epicId: string
  epicTitle: string
  deps: readonly string[]
  worktree?: string
  assignee?: string
}

export interface RoadmapGraphNode {
  id: string
  title: string
  status: StoryStatus
  epicId: string
  epicTitle: string
  worktree?: string
  assignee?: string
  /** Layout depth: 0 has no blockers, n is one past its deepest blocker. */
  depth: number
  /** Row within the depth column, assigned per epic so lanes stay together. */
  lane: number
  /** Ids this story is blocked BY (its `deps`, filtered to known stories). */
  blockedBy: readonly string[]
  /** Ids blocked by this story. */
  blocks: readonly string[]
  /** True when something upstream is not shipped. */
  isBlocked: boolean
  /**
   * Blockers that exist in the roadmap but are not on the canvas, because a
   * collapse hid them. The canvas shows this as a count on the node: a
   * dependency the reader cannot see is worse than one they can, so the graph
   * must never silently drop the edge and say nothing.
   */
  hiddenBlockers: number
  /** Stories this one gates that the same collapse hid. */
  hiddenBlocked: number
}

export interface RoadmapGraphEdge {
  id: string
  /** The blocker. */
  source: string
  /** The story it gates. */
  target: string
  /** True when the source is not yet shipped, i.e. the edge is still binding. */
  binding: boolean
}

export interface RoadmapEpicCluster {
  id: string
  title: string
  storyIds: readonly string[]
  /** Worst-case rollup across the epic's stories. */
  status: StoryStatus
  counts: Readonly<Record<StoryStatus, number>>
}

export interface RoadmapGraph {
  nodes: readonly RoadmapGraphNode[]
  edges: readonly RoadmapGraphEdge[]
  epics: readonly RoadmapEpicCluster[]
  /** Ids named in `deps` that no story in the set provides. */
  danglingDeps: readonly string[]
}

export interface RoadmapEpicGraph {
  nodes: readonly (RoadmapEpicCluster & { depth: number })[]
  edges: readonly RoadmapGraphEdge[]
}

const STATUS_ORDER: readonly StoryStatus[] = [
  "blocked",
  "in-progress",
  "verify",
  "ready",
  "spec",
  "idea",
  "shipped",
]

const EMPTY_COUNTS: Record<StoryStatus, number> = {
  idea: 0,
  spec: 0,
  ready: 0,
  "in-progress": 0,
  verify: 0,
  shipped: 0,
  blocked: 0,
}

export interface BuildRoadmapGraphOptions {
  /**
   * Drop shipped stories that no longer gate anything unshipped.
   *
   * A shipped story that still blocks unshipped work is KEPT even when
   * collapsing: removing it would sever the chain and make a blocked story
   * look unblocked, which is the one thing this view must never do.
   */
  readonly collapseShipped?: boolean
}

export function buildRoadmapGraph(
  stories: readonly RoadmapGraphStory[],
  options: BuildRoadmapGraphOptions = {},
): RoadmapGraph {
  const byId = new Map(stories.map((story) => [story.id, story]))
  const dangling = new Set<string>()

  const blockedBy = new Map<string, string[]>()
  const blocks = new Map<string, string[]>()
  for (const story of stories) {
    blockedBy.set(story.id, [])
    blocks.set(story.id, [])
  }
  for (const story of stories) {
    for (const dep of story.deps) {
      if (!byId.has(dep)) {
        dangling.add(dep)
        continue
      }
      if (dep === story.id) continue // a self-dep is data noise, not a cycle
      blockedBy.get(story.id)?.push(dep)
      blocks.get(dep)?.push(story.id)
    }
  }

  const visible = options.collapseShipped
    ? stories.filter(
        (story) =>
          story.status !== "shipped" ||
          (blocks.get(story.id) ?? []).some(
            (id) => byId.get(id)?.status !== "shipped",
          ),
      )
    : stories
  const visibleIds = new Set(visible.map((story) => story.id))

  const depth = computeDepths(visible, blockedBy, visibleIds)
  const lanes = assignLanes(visible, depth, blockedBy, visibleIds)

  const nodes: RoadmapGraphNode[] = visible.map((story) => {
    const allUpstream = blockedBy.get(story.id) ?? []
    const allDownstream = blocks.get(story.id) ?? []
    const upstream = allUpstream.filter((id) => visibleIds.has(id))
    return {
      id: story.id,
      title: story.title,
      status: story.status,
      epicId: story.epicId,
      epicTitle: story.epicTitle,
      ...(story.worktree ? { worktree: story.worktree } : {}),
      ...(story.assignee ? { assignee: story.assignee } : {}),
      depth: depth.get(story.id) ?? 0,
      lane: lanes.get(story.id) ?? 0,
      blockedBy: upstream,
      blocks: allDownstream.filter((id) => visibleIds.has(id)),
      hiddenBlockers: allUpstream.length - upstream.length,
      hiddenBlocked:
        allDownstream.length -
        allDownstream.filter((id) => visibleIds.has(id)).length,
      // Blocked means something upstream is not done — derived from the chain,
      // not from the story's own authored status, so a story nobody remembered
      // to mark blocked still reads as blocked.
      isBlocked: upstream.some((id) => byId.get(id)?.status !== "shipped"),
    }
  })

  const edges: RoadmapGraphEdge[] = []
  for (const node of nodes) {
    for (const source of node.blockedBy) {
      edges.push({
        id: `${source}->${node.id}`,
        source,
        target: node.id,
        binding: byId.get(source)?.status !== "shipped",
      })
    }
  }

  return {
    nodes,
    edges,
    epics: buildEpicClusters(visible),
    danglingDeps: [...dangling].sort(),
  }
}

/**
 * Longest-path depth, so a story sits one column past its deepest blocker.
 *
 * Iterative with a visiting set rather than naive recursion: `deps` are
 * authored by hand and a cycle is a data mistake we must survive rather than
 * stack-overflow on. A node in a cycle keeps the depth it had when the cycle
 * was detected, which keeps it on screen instead of dropping it.
 */
function computeDepths(
  stories: readonly RoadmapGraphStory[],
  blockedBy: ReadonlyMap<string, string[]>,
  visibleIds: ReadonlySet<string>,
): Map<string, number> {
  const depth = new Map<string, number>()
  const visiting = new Set<string>()

  const resolve = (id: string): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    visiting.add(id)
    const upstream = (blockedBy.get(id) ?? []).filter((dep) =>
      visibleIds.has(dep),
    )
    const value =
      upstream.length === 0
        ? 0
        : Math.max(...upstream.map((dep) => resolve(dep) + 1))
    visiting.delete(id)
    depth.set(id, value)
    return value
  }

  for (const story of stories) resolve(story.id)
  return depth
}

/**
 * Row assignment within each depth column: epic bands, ordered by barycenter.
 *
 * Two things have to be true at once. Stories of one epic get adjacent rows so
 * a lane reads as a band rather than scattering down the column — that is the
 * "cluster by epic" requirement, done in layout rather than with a background
 * box that would fight the edges. And rows should sit near the work they
 * depend on, or every long edge crosses every other one and the canvas reads
 * as noise.
 *
 * So: epic grouping is the outer key and never broken, but the ORDER of the
 * bands in a column, and the order of stories inside a band, comes from a
 * left-to-right barycenter pass — the median row of a story's already-placed
 * blockers. Column 0 has no blockers to average, so it falls back to the
 * stable alphabetical order the tests pin.
 */
function assignLanes(
  stories: readonly RoadmapGraphStory[],
  depth: ReadonlyMap<string, number>,
  blockedBy: ReadonlyMap<string, string[]>,
  visibleIds: ReadonlySet<string>,
): Map<string, number> {
  const epicOrder = [...new Set(stories.map((story) => story.epicId))].sort()
  const lanes = new Map<string, number>()
  const byDepth = new Map<number, RoadmapGraphStory[]>()
  for (const story of stories) {
    const column = depth.get(story.id) ?? 0
    const bucket = byDepth.get(column)
    if (bucket) bucket.push(story)
    else byDepth.set(column, [story])
  }

  /** Mean row of the blockers already placed to the left; null when none are. */
  const barycenter = (story: RoadmapGraphStory): number | null => {
    const placed = (blockedBy.get(story.id) ?? [])
      .filter((id) => visibleIds.has(id))
      .map((id) => lanes.get(id))
      .filter((row): row is number => row !== undefined)
    if (placed.length === 0) return null
    return placed.reduce((total, row) => total + row, 0) / placed.length
  }

  for (const column of [...byDepth.keys()].sort((a, b) => a - b)) {
    const bucket = byDepth.get(column) ?? []
    const centers = new Map(
      bucket.map((story) => [story.id, barycenter(story)]),
    )
    // An epic sits where its anchored stories sit. Epics with nothing to
    // anchor to keep their alphabetical place, offset past the anchored ones
    // so they settle at the bottom of the column instead of interleaving.
    const epicCenter = new Map<string, number>()
    for (const epicId of epicOrder) {
      const anchored = bucket
        .filter((story) => story.epicId === epicId)
        .map((story) => centers.get(story.id))
        .filter((center): center is number => center !== null && center !== undefined)
      if (anchored.length > 0) {
        epicCenter.set(
          epicId,
          anchored.reduce((total, center) => total + center, 0) /
            anchored.length,
        )
      }
    }

    bucket
      .slice()
      .sort((left, right) => {
        const leftEpic = epicCenter.get(left.epicId)
        const rightEpic = epicCenter.get(right.epicId)
        if (left.epicId !== right.epicId) {
          if (leftEpic !== undefined && rightEpic !== undefined) {
            if (leftEpic !== rightEpic) return leftEpic - rightEpic
          } else if (leftEpic !== undefined) return -1
          else if (rightEpic !== undefined) return 1
          return epicOrder.indexOf(left.epicId) - epicOrder.indexOf(right.epicId)
        }
        const leftCenter = centers.get(left.id)
        const rightCenter = centers.get(right.id)
        if (leftCenter !== null && leftCenter !== undefined && rightCenter !== null && rightCenter !== undefined) {
          if (leftCenter !== rightCenter) return leftCenter - rightCenter
        } else if (leftCenter !== null && leftCenter !== undefined) return -1
        else if (rightCenter !== null && rightCenter !== undefined) return 1
        return left.id.localeCompare(right.id)
      })
      .forEach((story, index) => lanes.set(story.id, index))
  }
  return lanes
}

function buildEpicClusters(
  stories: readonly RoadmapGraphStory[],
): RoadmapEpicCluster[] {
  const clusters = new Map<string, RoadmapEpicCluster & { counts: Record<StoryStatus, number> }>()
  for (const story of stories) {
    const existing = clusters.get(story.epicId)
    if (existing) {
      existing.counts[story.status] += 1
      ;(existing.storyIds as string[]).push(story.id)
      continue
    }
    const counts = { ...EMPTY_COUNTS }
    counts[story.status] += 1
    clusters.set(story.epicId, {
      id: story.epicId,
      title: story.epicTitle,
      storyIds: [story.id],
      status: story.status,
      counts,
    })
  }
  return [...clusters.values()]
    .map((cluster) => ({ ...cluster, status: rollupStatus(cluster.counts) }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * An epic reads as its most urgent unfinished story.
 *
 * "All shipped" is the only way an epic reads shipped; otherwise the worst
 * live status wins, because the executive question is "what needs attention",
 * not "what is the average".
 */
export function rollupStatus(counts: Readonly<Record<StoryStatus, number>>): StoryStatus {
  for (const status of STATUS_ORDER) {
    if (status === "shipped") continue
    if ((counts[status] ?? 0) > 0) return status
  }
  return "shipped"
}

/**
 * Epic-level distillation: one node per epic, edges where any story in one
 * epic gates a story in another. This is the "what gates what" view — the
 * same data, answered at a different altitude.
 */
export function buildRoadmapEpicGraph(graph: RoadmapGraph): RoadmapEpicGraph {
  const epicOf = new Map(graph.nodes.map((node) => [node.id, node.epicId]))
  const seen = new Map<string, RoadmapGraphEdge>()
  for (const edge of graph.edges) {
    const source = epicOf.get(edge.source)
    const target = epicOf.get(edge.target)
    if (!source || !target || source === target) continue
    const id = `${source}->${target}`
    const existing = seen.get(id)
    // One cross-lane edge per epic pair; it stays binding if ANY underlying
    // dependency is still binding.
    if (existing) {
      if (edge.binding && !existing.binding) {
        seen.set(id, { ...existing, binding: true })
      }
      continue
    }
    seen.set(id, { id, source, target, binding: edge.binding })
  }

  const edges = [...seen.values()]
  const blockedBy = new Map<string, string[]>()
  for (const epic of graph.epics) blockedBy.set(epic.id, [])
  for (const edge of edges) blockedBy.get(edge.target)?.push(edge.source)

  const visibleIds = new Set(graph.epics.map((epic) => epic.id))
  const depth = computeDepths(
    graph.epics.map((epic) => ({
      id: epic.id,
      title: epic.title,
      status: epic.status,
      epicId: epic.id,
      epicTitle: epic.title,
      deps: blockedBy.get(epic.id) ?? [],
    })),
    blockedBy,
    visibleIds,
  )

  return {
    nodes: graph.epics.map((epic) => ({
      ...epic,
      depth: depth.get(epic.id) ?? 0,
    })),
    edges,
  }
}

export interface BlockingChain {
  /** Everything that gates the selection, transitively. */
  upstream: readonly string[]
  /** Everything the selection gates, transitively. */
  downstream: readonly string[]
  /** Selection plus both directions — what the canvas should keep lit. */
  highlighted: ReadonlySet<string>
  /** Edge ids on the chain. */
  edges: ReadonlySet<string>
}

/**
 * The full blocking chain through a story, both directions.
 *
 * This is acceptance criterion 2: selecting MEM.5 must light WGS.1 above it
 * and the migration below it, in one glance, without opening anything.
 */
export function blockingChain(
  graph: RoadmapGraph,
  storyId: string,
): BlockingChain {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  if (!byId.has(storyId)) {
    return {
      upstream: [],
      downstream: [],
      highlighted: new Set(),
      edges: new Set(),
    }
  }

  const walk = (start: string, next: (id: string) => readonly string[]) => {
    const found: string[] = []
    const seen = new Set<string>([start])
    const queue = [...next(start)]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (seen.has(id)) continue // also terminates on an authored cycle
      seen.add(id)
      found.push(id)
      queue.push(...next(id))
    }
    return found
  }

  const upstream = walk(storyId, (id) => byId.get(id)?.blockedBy ?? [])
  const downstream = walk(storyId, (id) => byId.get(id)?.blocks ?? [])
  const highlighted = new Set([storyId, ...upstream, ...downstream])
  const edges = new Set(
    graph.edges
      .filter(
        (edge) => highlighted.has(edge.source) && highlighted.has(edge.target),
      )
      .map((edge) => edge.id),
  )

  return { upstream, downstream, highlighted, edges }
}
