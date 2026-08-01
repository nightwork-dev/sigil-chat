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

import { useEffect, useMemo, useState } from "react"
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeTypes,
} from "@xyflow/react"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"

import { CanvasControls } from "@/features/graph-canvas/canvas-controls"
import { useStableFlowNodes } from "@/features/graph-canvas/use-stable-flow-nodes"

import {
  HANDLE,
  layoutCanvas,
  routeEdges,
  STORY_HEIGHT,
  STORY_WIDTH,
} from "./roadmap-graph-layout"
import {
  blockingChain,
  buildRoadmapCanvas,
  buildRoadmapGraph,
  defaultExpandedEpics,
  type RoadmapGraphStory,
} from "./roadmap-graph"

import "@xyflow/react/dist/style.css"

interface StoryNodeData extends Record<string, unknown> {
  label: string
  status: string
  detail: string
  /** Rendered as "+n" when the shipped collapse hid dependencies of this node. */
  hidden: number
  blocked: boolean
  dimmed: boolean
  onChain: boolean
  selected: boolean
}

interface EpicNodeData extends Record<string, unknown> {
  label: string
  title: string
  status: string
  total: number
  blockedCount: number
  dimmed: boolean
  onChain: boolean
}

interface ContainerNodeData extends Record<string, unknown> {
  label: string
  title: string
  total: number
  blockedCount: number
  dimmed: boolean
}

type GraphNode =
  | Node<StoryNodeData, "story">
  | Node<EpicNodeData, "epic">
  | Node<ContainerNodeData, "epic-container">

// Hoisted: React Flow treats a new nodeTypes object as a type-table change and
// remounts every node, which is an independent source of flicker.
const nodeTypes: NodeTypes = {
  story: StoryFlowNode,
  epic: EpicRollupNode,
  "epic-container": EpicContainerNode,
}

export function RoadmapGraphView({
  stories,
  initialStoryId,
  onSelectStory,
}: {
  stories: readonly RoadmapGraphStory[]
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
  const layout = useMemo(() => layoutCanvas(canvas), [canvas])

  const derived = useMemo(() => {
    // A chain is expressed in story ids, and on this canvas some of those
    // stories are currently a lane. Light whatever stands for them.
    const lit = chain
      ? new Set(
          [...chain.highlighted].map((id) => canvas.presentation.get(id) ?? id),
        )
      : null

    const containers: GraphNode[] = []
    const cards: GraphNode[] = []

    for (const epic of canvas.epics) {
      const box = layout.epics.get(epic.id)
      if (!box) continue
      const total = Object.values(epic.counts).reduce((a, b) => a + b, 0)

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
            dimmed: lit ? !lit.has(epic.id) : false,
            onChain: lit ? lit.has(epic.id) : false,
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
          dimmed: lit ? !lit.has(story.id) : false,
          onChain: lit ? lit.has(story.id) : false,
          selected: story.id === selected,
        },
      })
    }

    return {
      // Containers first so they paint behind the cards they hold.
      nodes: [...containers, ...cards],
      edges: routeEdges(canvas, layout, chain ? chain.edges : null),
    }
  }, [canvas, layout, chain, selected])

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
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={28}
              size={1}
              color="var(--color-border)"
            />
            <CanvasControls />
            <FitOnLayout signature={layoutSignature} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
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

function StoryFlowNode({ data }: { data: StoryNodeData }) {
  return (
    <div
      className={cn(
        "flex size-full cursor-pointer flex-col justify-center gap-0.5 rounded-md border bg-card px-3 py-2 text-left transition-opacity",
        // Blocked is the tinted edge of the card, not a shouted label.
        data.blocked ? "border-destructive/40" : "border-border",
        data.onChain && !data.selected && "border-primary/50",
        data.selected && "border-primary ring-1 ring-primary",
        data.dimmed && "opacity-20",
      )}
    >
      <EdgeHandles />
      <div className="flex items-center gap-1.5">
        {data.blocked ? (
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-destructive/70"
          />
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
        data.blockedCount > 0 ? "border-destructive/40" : "border-border",
        data.onChain && "border-primary/50",
        data.dimmed && "opacity-20",
      )}
    >
      <EdgeHandles />
      <div className="flex items-center gap-1.5">
        <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs font-medium text-foreground">
          {data.label}
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {data.status}
        </span>
      </div>
      <p className="truncate text-xs text-muted-foreground">{data.title}</p>
      <p className="text-[10px] text-muted-foreground">
        {data.total} {data.total === 1 ? "story" : "stories"}
        {data.blockedCount > 0 ? (
          <span className="text-destructive/80">
            {" · "}
            {data.blockedCount} blocked
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
