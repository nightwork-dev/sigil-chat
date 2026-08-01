"use client"

// Roadmap graph: one canvas that answers both of David's questions at once.
//
// "What blocks this story" and "what gates this lane" used to be two views
// behind a toggle. They are the same graph read at two altitudes, so there is
// now one surface holding both: every epic is a container, either expanded
// into its stories or collapsed to a rollup node, and a dependency is drawn
// between whatever each of its ends currently presents as. The two old views
// are just the extremes of this one — expand all, collapse all.
//
// What lives where: roadmap-graph.ts decides structure (which lane gates which,
// which cell a story occupies inside its lane, how an edge re-attaches when a
// lane folds up) and is pure and tested. This file turns that into pixels and
// owns interaction only.
//
// Design language, and the reasons this file looks the way it does:
//
//   * Containers are owner-drawn, not React Flow subflows. Every node —
//     container included — sits in absolute canvas coordinates and declares its
//     own width and height. Subflows would have React Flow auto-size each group
//     by MEASURING it, which is the same measure-driven path that made both
//     canvases flicker (see use-stable-flow-nodes), and we need none of what
//     they buy: nodes here are not draggable and never need clamping to a
//     parent's extent.
//   * Every node carries a CUSTOM type name. React Flow's `default` type name
//     also applies `.react-flow__node-default` — a 150px white box — which
//     showed as a ghost rectangle behind each card.
//   * Custom nodes render <Handle>s, or React Flow has no endpoint to attach an
//     edge to and drops it silently.
//   * Colour means exactly one thing: destructive is BLOCKED, primary is the
//     selection and its chain. Blocked is a tinted border and one dot rather
//     than red text on every card — with dozens blocked, red everywhere stops
//     being a signal. Status is quiet text at every status.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  Background,
  BackgroundVariant,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"

import { CanvasControls } from "@/features/graph-canvas/canvas-controls"
import { CrossLaneEdge } from "./roadmap-cross-lane-edge"
import { useSetUserSetting, useUserSetting } from "@/lib/user-settings"
import { useStableFlowNodes } from "@/features/graph-canvas/use-stable-flow-nodes"

import {
  HANDLE,
  layoutCanvas,
  routeEdges,
  STORY_HEIGHT,
  STORY_WIDTH,
  type ChainDirection,
} from "./roadmap-graph-layout"
import {
  blockingChain,
  goalPaths,
  buildRoadmapCanvas,
  buildRoadmapGraph,
  defaultExpandedEpics,
  type RoadmapGraphStory,
} from "./roadmap-graph"

import "@xyflow/react/dist/style.css"

/**
 * The glyph vocabulary. Small on purpose: a glyph marks a NOTABLE state, and
 * its absence means "ordinary", which is why idea/spec/ready have none. The
 * status word stays on every card — the glyph is there to be scannable at a
 * zoom where the word is not.
 *
 * Colour stays a three-way budget no matter how many glyphs exist: accent is
 * on-a-goal-path, destructive is blocked, everything else is muted. Status
 * variety lives in these shapes, never in a per-status palette.
 */
const GLYPH = {
  goal: "\u25ce",
  blocked: "\u25cf",
  inaccessible: "\u25cb",
  inProgress: "\u25d0",
  shipped: "\u2713",
} as const

function statusGlyph(data: {
  status: string
  blocked: boolean
  frontier: boolean
}): string | null {
  if (data.frontier) return GLYPH.blocked
  if (data.blocked) return GLYPH.inaccessible
  if (data.status === "in-progress" || data.status === "verify") {
    return GLYPH.inProgress
  }
  if (data.status === "shipped") return GLYPH.shipped
  return null
}

/**
 * Pinning is an action, not data, so it travels by context rather than through
 * node `data` — a callback there would change identity on every render and
 * undo the node-stability work that stopped the canvas flickering.
 */
const GoalActionsContext = createContext<{
  toggle: (storyId: string) => void
} | null>(null)

interface StoryNodeData extends Record<string, unknown> {
  label: string
  status: string
  detail: string
  /** Rendered as "+n" when the shipped collapse hid dependencies of this node. */
  hidden: number
  blocked: boolean
  /** Blocked and where the line stalls — the only thing that reads as red. */
  frontier: boolean
  /** In flight right now. */
  live: boolean
  /** Which side of the current selection this sits on, if any. */
  direction: ChainDirection | null
  dimmed: boolean
  onChain: boolean
  selected: boolean
  /** Pinned as something to reach. */
  goal: boolean
  /** On the way to a pinned goal. */
  onPath: boolean
  /** On the way to a goal AND stuck: the strongest mark on the canvas. */
  pathBlocker: boolean
  /** Stepped back because goals are pinned and this is not on the way. */
  aside: boolean
}

interface EpicNodeData extends Record<string, unknown> {
  label: string
  title: string
  status: string
  total: number
  blockedCount: number
  frontierCount: number
  liveCount: number
  direction: ChainDirection | null
  dimmed: boolean
  onChain: boolean
  goalCount: number
  onPath: boolean
  pathBlockedCount: number
  aside: boolean
}

interface ContainerNodeData extends Record<string, unknown> {
  label: string
  title: string
  total: number
  blockedCount: number
  dimmed: boolean
  goalCount: number
  onPath: boolean
}

type GraphNode =
  | Node<StoryNodeData, "story">
  | Node<EpicNodeData, "epic">
  | Node<ContainerNodeData, "epic-container">

// Hoisted: React Flow treats a new nodeTypes object as a type-table change and
// remounts every node, which is an independent source of flicker.
// Hoisted for the same reason as nodeTypes: a fresh object is a type-table
// change and remounts every edge.
const edgeTypes: EdgeTypes = { "cross-lane": CrossLaneEdge }

const nodeTypes: NodeTypes = {
  story: StoryFlowNode,
  epic: EpicRollupNode,
  "epic-container": EpicContainerNode,
}

export function RoadmapGraphView({
  stories,
  viewerId,
  initialStoryId,
  onSelectStory,
}: {
  stories: readonly RoadmapGraphStory[]
  /** Goals are a personal lens, so they are stored against the viewer. */
  viewerId: string
  initialStoryId?: string
  onSelectStory?: (storyId: string | null) => void
}) {
  const [showShipped, setShowShipped] = useState(false)
  const [selected, setSelected] = useState<string | null>(initialStoryId ?? null)

  // Open the lanes with work in flight, plus the lane of a deep-linked story so
  // the link lands on the story itself rather than on the lane hiding it.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const initial = defaultExpandedEpics(
      buildRoadmapGraph(stories, { collapseShipped: true }),
    )
    const target = stories.find((story) => story.id === initialStoryId)
    if (target) initial.add(target.epicId)
    return initial
  })

  const graph = useMemo(
    () => buildRoadmapGraph(stories, { collapseShipped: !showShipped }),
    [stories, showShipped],
  )
  const canvas = useMemo(
    () => buildRoadmapCanvas(graph, { expandedEpics: expanded }),
    [graph, expanded],
  )
  const chain = useMemo(
    () => (selected ? blockingChain(graph, selected) : null),
    [graph, selected],
  )

  const goalSetting = useUserSetting(viewerId, "roadmap.goalStoryIds")
  const setGoals = useSetUserSetting(viewerId, "roadmap.goalStoryIds")
  const pinned = useMemo(() => goalSetting.data?.value ?? [], [goalSetting.data])
  const goals = useMemo(() => goalPaths(graph, pinned), [graph, pinned])
  // `mutate` rather than the mutation object: React Query hands back a new
  // object every render, and this value is the context every card reads.
  const mutateGoals = setGoals.mutate
  const goalRevision = goalSetting.data?.revision ?? undefined
  const goalActions = useMemo(
    () => ({
      toggle: (storyId: string) => {
        const next = pinned.includes(storyId)
          ? pinned.filter((id) => id !== storyId)
          : [...pinned, storyId]
        mutateGoals({
          scopeKind: "user",
          scopeId: "",
          value: next,
          expectedRevision: goalRevision,
        })
      },
    }),
    [pinned, mutateGoals, goalRevision],
  )
  const layout = useMemo(() => layoutCanvas(canvas), [canvas])

  // Which side of the selection each thing sits on. Selecting a story has to
  // answer "what does this wait for" and "what waits for this" as two visibly
  // different answers, not one undifferentiated halo.
  const direction = useMemo(() => {
    if (!chain) return null
    const nodes = new Map<string, ChainDirection>()
    for (const id of chain.upstream) nodes.set(id, "upstream")
    for (const id of chain.downstream) nodes.set(id, "downstream")
    return nodes
  }, [chain])

  const derived = useMemo(() => {
    // A chain is expressed in story ids, and on this canvas some of those
    // stories are currently a lane. Light whatever stands for them.
    const lit = chain
      ? new Set(
          [...chain.highlighted].map((id) => canvas.presentation.get(id) ?? id),
        )
      : null

    // An edge takes the selection's colour only when BOTH its ends are on the
    // same side of it, so a line crossing from upstream to downstream through
    // the selected story is never mislabelled.
    const edgeDirection = direction
      ? new Map(
          canvas.edges.flatMap((edge) => {
            const from = direction.get(edge.source) ?? null
            const to = direction.get(edge.target) ?? null
            const side =
              from === "upstream" || to === "upstream"
                ? from === "downstream" || to === "downstream"
                  ? null
                  : "upstream"
                : from === "downstream" || to === "downstream"
                  ? "downstream"
                  : null
            return side ? [[edge.id, side] as const] : []
          }),
        )
      : null

    const containers: GraphNode[] = []
    const cards: GraphNode[] = []

    for (const epic of canvas.epics) {
      const box = layout.epics.get(epic.id)
      if (!box) continue
      const total = Object.values(epic.counts).reduce((a, b) => a + b, 0)
      const goalCount = epic.storyIds.filter((id) => goals.goals.has(id)).length
      const onPath = epic.storyIds.some((id) => goals.path.has(id))
      const pathBlockedCount = epic.storyIds.filter((id) =>
        goals.blockers.has(id),
      ).length
      const liveCount = epic.counts["in-progress"] ?? 0
      // A folded lane takes a side only when every story of its that is on the
      // chain agrees; a lane straddling both sides stays neutral rather than
      // claiming a direction it does not have.
      const sides = new Set(
        epic.storyIds
          .map((id) => direction?.get(id))
          .filter((side): side is ChainDirection => side !== undefined),
      )
      const epicDirection = sides.size === 1 ? [...sides][0]! : null

      if (!epic.expanded) {
        cards.push({
          id: epic.id,
          type: "epic",
          position: { x: box.x, y: box.y },
          width: box.width,
          height: box.height,
          data: {
            label: epic.id,
            title: epic.title,
            status: epic.status,
            total,
            blockedCount: epic.blockedCount,
            frontierCount: epic.frontierCount,
            liveCount: liveCount,
            direction: epicDirection,
            dimmed: lit ? !lit.has(epic.id) : false,
            onChain: lit ? lit.has(epic.id) : false,
            goalCount,
            onPath,
            pathBlockedCount,
            aside: goals.path.size > 0 && !onPath,
          },
        })
        continue
      }

      containers.push({
        id: `container:${epic.id}`,
        type: "epic-container",
        position: { x: box.x, y: box.y },
        width: box.width,
        height: box.height,
        selectable: false,
        focusable: false,
        // Scenery: clicks fall through to the pane, except on the header strip,
        // which re-enables them so the lane can be folded back up.
        style: { pointerEvents: "none" as const },
        data: {
          label: epic.id,
          title: epic.title,
          total,
          blockedCount: epic.blockedCount,
          dimmed: lit ? !epic.storyIds.some((id) => lit.has(id)) : false,
          goalCount,
          onPath,
        },
      })
    }

    for (const story of canvas.stories) {
      const at = layout.stories.get(story.id)
      if (!at) continue
      cards.push({
        id: story.id,
        type: "story",
        position: at,
        // Declared, not measured: these cards are a fixed size, and a node that
        // arrives with dimensions is never hidden waiting for a ResizeObserver.
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        data: {
          label: story.id,
          status: story.status,
          detail: story.title,
          hidden: story.hiddenBlockers + story.hiddenBlocked,
          blocked: story.isBlocked,
          frontier: story.isFrontier,
          live: story.status === "in-progress",
          direction: direction?.get(story.id) ?? null,
          dimmed: lit ? !lit.has(story.id) : false,
          onChain: lit ? lit.has(story.id) : false,
          selected: story.id === selected,
          goal: goals.goals.has(story.id),
          onPath: goals.path.has(story.id),
          pathBlocker: goals.blockers.has(story.id),
          aside: goals.path.size > 0 && !goals.path.has(story.id),
        },
      })
    }

    return {
      // Containers first so they paint behind the cards they hold.
      nodes: [...containers, ...cards],
      edges: routeEdges(
        canvas,
        layout,
        chain ? chain.edges : null,
        goals.edges.size > 0 ? goals.edges : null,
        edgeDirection,
      ),
    }
  }, [canvas, layout, chain, selected, goals, direction])

  const { nodes, onNodesChange } = useStableFlowNodes<GraphNode>(derived.nodes)

  // What the viewport must be re-fitted for: which lanes are open, and how
  // much is on the canvas. Not the selection — tracing a chain shouldn't move
  // the map under the cursor.
  const layoutSignature = `${[...expanded].sort().join(",")}|${derived.nodes.length}`

  const allExpanded = canvas.epics.every((epic) => epic.expanded)
  const hiddenTotal = graph.nodes.reduce(
    (total, node) => total + node.hiddenBlockers + node.hiddenBlocked,
    0,
  )

  const select = (next: string | null) => {
    setSelected(next)
    onSelectStory?.(next)
  }
  const toggleEpic = (epicId: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(epicId)) next.add(epicId)
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setExpanded(
              allExpanded
                ? new Set()
                : new Set(canvas.epics.map((epic) => epic.id)),
            )
          }
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </Button>

        <div className="flex items-center gap-2">
          <Switch
            id="roadmap-graph-shipped"
            checked={showShipped}
            onCheckedChange={setShowShipped}
          />
          <Label htmlFor="roadmap-graph-shipped" className="text-xs">
            Show shipped
          </Label>
        </div>

        {goals.goals.size > 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <span aria-hidden className="text-primary">
                {GLYPH.goal}
              </span>{" "}
              {goals.goals.size} goal{goals.goals.size === 1 ? "" : "s"} ·{" "}
              {goals.path.size - goals.goals.size} to finish first
              {goals.blockers.size > 0 ? (
                <>
                  {" · "}
                  <span className="text-destructive">
                    {goals.blockers.size} stuck
                  </span>
                </>
              ) : null}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                mutateGoals({
                  scopeKind: "user",
                  scopeId: "",
                  value: [],
                  expectedRevision: goalRevision,
                })
              }
            >
              Clear goals
            </Button>
          </div>
        ) : null}

        {chain && selected ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              <span className="font-mono text-foreground">{selected}</span> —{" "}
              {chain.upstream.length} blocking, {chain.downstream.length}{" "}
              waiting
            </span>
            <Button size="sm" variant="ghost" onClick={() => select(null)}>
              Clear
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Blockers sit to the left. Click a lane to open it, a story to trace
            its chain.
          </p>
        )}

        {hiddenTotal > 0 ? (
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">+n</span> counts dependencies hidden by
            the shipped collapse.
          </p>
        ) : null}

        {graph.danglingDeps.length > 0 ? (
          <p className="text-xs text-destructive">
            {graph.danglingDeps.length} dependency id
            {graph.danglingDeps.length === 1 ? "" : "s"} name no known story:{" "}
            <span className="font-mono">{graph.danglingDeps.join(", ")}</span>
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <GoalActionsContext.Provider value={goalActions}>
          <ReactFlowProvider>
          <ReactFlow<GraphNode>
            nodes={nodes}
            edges={derived.edges}
            onNodesChange={onNodesChange}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            // Selection is ours, not React Flow's: `selected` here means "this
            // is the story whose chain is lit", which the projection decides.
            // Letting React Flow keep a second, internal notion of selected
            // would elevate node z-order and fight it for no gain — and node
            // clicks are still delivered when elements aren't selectable.
            elementsSelectable={false}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            minZoom={0.08}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_event, node) => {
              if (node.type === "story") {
                select(node.id === selected ? null : node.id)
                return
              }
              if (node.type === "epic") toggleEpic(node.id)
              if (node.type === "epic-container") {
                toggleEpic(node.id.slice("container:".length))
              }
            }}
            onPaneClick={() => select(null)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={28}
              size={1}
              color="var(--color-border)"
            />
            <CanvasControls />
            <Legend
              hasGoals={goals.goals.size > 0}
              hasSelection={selected !== null}
            />
            <FitOnLayout signature={layoutSignature} />
          </ReactFlow>
          </ReactFlowProvider>
        </GoalActionsContext.Provider>
      </div>
    </div>
  )
}

/**
 * The key to the glyphs, so the vocabulary explains itself.
 *
 * A canvas is a glanceable surface, so this is a key and not prose: one mark
 * and one word each. The goal row appears only once goals exist, because a
 * legend entry for something not on screen defines nothing.
 */
function Legend({
  hasGoals,
  hasSelection,
}: {
  hasGoals: boolean
  hasSelection: boolean
}) {
  const marks = [
    { glyph: GLYPH.blocked, label: "stuck", tone: "text-destructive" },
    {
      glyph: GLYPH.inaccessible,
      label: "not yet reachable",
      tone: "text-muted-foreground/50",
    },
    { glyph: GLYPH.inProgress, label: "in flight", tone: "text-foreground" },
    { glyph: GLYPH.shipped, label: "shipped", tone: "text-muted-foreground" },
    ...(hasGoals
      ? [{ glyph: GLYPH.goal, label: "goal", tone: "text-primary" }]
      : []),
  ]

  return (
    <Panel className="m-3!" position="bottom-right">
      <div className="flex flex-col gap-1 rounded-md border border-border bg-background/90 px-2 py-1 backdrop-blur">
        <ul className="flex items-center gap-2.5">
          {marks.map((mark) => (
            <li
              key={mark.label}
              className="flex items-center gap-1 text-[10px] text-muted-foreground"
            >
              <span aria-hidden className={mark.tone}>
                {mark.glyph}
              </span>
              {mark.label}
            </li>
          ))}
        </ul>
        {/* Only while a selection exists: these two colours mean nothing on a
            canvas with nothing selected. */}
        {hasSelection ? (
          <ul className="flex items-center gap-2.5 border-t border-border pt-1">
            <li className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span aria-hidden className="text-chart-5">
                &#9473;
              </span>
              blocks it
            </li>
            <li className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span aria-hidden className="text-chart-1">
                &#9473;
              </span>
              waits on it
            </li>
          </ul>
        ) : null}
      </div>
    </Panel>
  )
}

/**
 * Re-fit the viewport when the layout changes shape.
 *
 * React Flow's `fitView` prop fits once, at init. Expanding or collapsing a
 * lane rewrites the whole layout underneath a viewport that no longer frames
 * it, which is what left a screen of dead space beside the content. This is an
 * effect because the viewport is the library's imperative state, not ours.
 */
function FitOnLayout({ signature }: { signature: string }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    void fitView({ duration: 220, padding: 0.12, maxZoom: 1.1 })
  }, [signature, fitView])
  return null
}

/**
 * Four sides, each with a job: left and right carry cross-lane traffic, top and
 * bottom carry the hops down a lane, and `rightIn` receives the detour that
 * skips a card. All invisible — nothing here is connectable by hand.
 */
function EdgeHandles() {
  const hidden = "h-1! w-1! border-0! bg-transparent! opacity-0"
  return (
    <>
      <Handle
        id={HANDLE.left}
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={hidden}
      />
      <Handle
        id={HANDLE.top}
        type="target"
        position={Position.Top}
        isConnectable={false}
        className={hidden}
      />
      <Handle
        id={HANDLE.rightIn}
        type="target"
        position={Position.Right}
        isConnectable={false}
        className={hidden}
      />
      <Handle
        id={HANDLE.right}
        type="source"
        position={Position.Right}
        isConnectable={false}
        className={hidden}
      />
      <Handle
        id={HANDLE.bottom}
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className={hidden}
      />
    </>
  )
}

function StoryFlowNode({ id, data }: { id: string; data: StoryNodeData }) {
  const actions = useContext(GoalActionsContext)
  const glyph = statusGlyph(data)
  return (
    <div
      className={cn(
        "group flex size-full cursor-pointer flex-col justify-center gap-0.5 rounded-md border bg-card px-3 py-2 text-left transition-opacity",
        // Border precedence, strongest first: stuck ON the way to a goal is the
        // thing to look at, then merely stuck, then merely on the way.
        // Red is reserved for a line that has actually stalled. Work that is
        // merely far downstream of a stall is INACCESSIBLE, not blocked, and
        // recedes instead of shouting.
        data.pathBlocker && data.frontier
          ? "border-destructive ring-1 ring-destructive/40"
          : data.frontier
            ? "border-destructive/50"
            : data.onPath
              ? "border-primary/60"
              : data.blocked
                ? "border-border/50 saturate-50"
                : "border-border",
        data.direction === "upstream" && "border-chart-5",
        data.direction === "downstream" && "border-chart-1",
        data.onChain &&
          !data.selected &&
          !data.onPath &&
          !data.direction &&
          "border-primary/50",
        data.selected && "border-primary ring-1 ring-primary",
        // Two strengths of receding: a transient selection pushes everything
        // else right back, pinned goals only step the rest aside.
        data.dimmed ? "opacity-20" : data.aside && "opacity-60",
      )}
    >
      <EdgeHandles />
      <div className="flex items-center gap-1.5">
        {glyph ? (
          <span
            aria-hidden
            className={cn(
              "shrink-0 text-[10px] leading-none",
              data.frontier
                ? "text-destructive"
                : data.blocked
                  ? "text-muted-foreground/50"
                  : "text-muted-foreground",
              // Motion tied to a real state: this work is happening right now.
              data.live && "animate-pulse text-foreground",
            )}
          >
            {glyph}
          </span>
        ) : null}
        <span className="truncate font-mono text-xs font-medium text-foreground">
          {data.label}
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {data.status}
        </span>
        {data.hidden > 0 ? (
          <span
            className="shrink-0 font-mono text-[10px] text-muted-foreground"
            title={`${data.hidden} dependenc${data.hidden === 1 ? "y" : "ies"} hidden by the shipped collapse`}
          >
            +{data.hidden}
          </span>
        ) : null}
        {/* State and affordance in one mark: it shows whether this is a goal,
            and it is how you make it one. Quiet until hovered unless pinned. */}
        <button
          type="button"
          aria-label={data.goal ? "Unpin goal" : "Pin as goal"}
          aria-pressed={data.goal}
          title={data.goal ? "Unpin goal" : "Pin as goal"}
          onClick={(event) => {
            event.stopPropagation()
            actions?.toggle(id)
          }}
          className={cn(
            "shrink-0 rounded-sm text-[11px] leading-none transition-opacity",
            data.goal
              ? "text-primary opacity-100"
              : "text-muted-foreground opacity-0 group-hover:opacity-70",
          )}
        >
          {GLYPH.goal}
        </button>
      </div>
      <p className="truncate text-xs text-muted-foreground">{data.detail}</p>
    </div>
  )
}

/** A lane folded up: one node standing for every story inside it. */
function EpicRollupNode({ data }: { data: EpicNodeData }) {
  return (
    <div
      className={cn(
        "flex size-full cursor-pointer flex-col justify-center gap-0.5 rounded-md border bg-card px-3 py-2 text-left transition-opacity",
        data.pathBlockedCount > 0 && data.frontierCount > 0
          ? "border-destructive ring-1 ring-destructive/40"
          : data.frontierCount > 0
            ? "border-destructive/50"
            : data.onPath
              ? "border-primary/60"
              : data.blockedCount > 0
                ? "border-border/50 saturate-50"
                : "border-border",
        data.direction === "upstream" && "border-chart-5",
        data.direction === "downstream" && "border-chart-1",
        data.onChain && !data.onPath && !data.direction && "border-primary/50",
        data.dimmed ? "opacity-20" : data.aside && "opacity-60",
      )}
    >
      <EdgeHandles />
      <div className="flex items-center gap-1.5">
        <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs font-medium text-foreground">
          {data.label}
        </span>
        {data.goalCount > 0 ? (
          <span
            aria-hidden
            className="shrink-0 text-[10px] leading-none text-primary"
            title={`${data.goalCount} pinned goal${data.goalCount === 1 ? "" : "s"} in this lane`}
          >
            {GLYPH.goal}
            {data.goalCount > 1 ? data.goalCount : null}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {data.status}
        </span>
      </div>
      <p className="truncate text-xs text-muted-foreground">{data.title}</p>
      <p className="text-[10px] text-muted-foreground">
        {data.total} {data.total === 1 ? "story" : "stories"}
        {data.liveCount > 0 ? (
          <span className="text-foreground">
            {" · "}
            {data.liveCount} in flight
          </span>
        ) : null}
        {data.frontierCount > 0 ? (
          <span className="text-destructive/80">
            {" · "}
            {data.frontierCount} stuck
          </span>
        ) : null}
      </p>
    </div>
  )
}

/** A lane opened up: chrome around its stories, and the way to fold it back. */
function EpicContainerNode({ data }: { data: ContainerNodeData }) {
  return (
    <div
      className={cn(
        "pointer-events-none size-full rounded-lg border border-dashed bg-muted/20 transition-opacity",
        data.blockedCount > 0 ? "border-destructive/25" : "border-border/60",
        data.onPath && "border-primary/40",
        data.dimmed && "opacity-40",
      )}
    >
      <div className="pointer-events-auto flex cursor-pointer items-center gap-1 px-2 py-1">
        <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        <span className="font-mono text-[10px] text-foreground">
          {data.label}
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {data.title}
        </span>
        {data.goalCount > 0 ? (
          <span aria-hidden className="shrink-0 text-[10px] text-primary">
            {GLYPH.goal}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {data.total}
          {data.blockedCount > 0 ? (
            <span className="text-destructive/80">
              {" · "}
              {data.blockedCount} blocked
            </span>
          ) : null}
        </span>
      </div>
    </div>
  )
}
