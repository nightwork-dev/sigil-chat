"use client"

// Roadmap graph: the dependency reading of the same stories the board shows.
//
// Row order and depth are computed in roadmap-graph.ts, not here — this file
// turns that projection into pixels and owns interaction only. Two altitudes
// over one data set: Stories (every story, epic-clustered) and Epics (one node
// per lane, the "what gates what" answer). Selecting a node lights its full
// blocking chain in both directions and dims everything else, which is the
// one-glance requirement.
//
// Design language, and the reason this file looks the way it does:
//
//   * Every node carries a CUSTOM type name. Using React Flow's `default` type
//     name also applies `.react-flow__node-default` from its stylesheet — a
//     150px white box with a dark border — which showed as a ghost rectangle
//     behind each card.
//   * Custom nodes render <Handle>s. Without them React Flow has no endpoint
//     to attach an edge to and every edge silently disappears, which is why
//     this read as disconnected columns rather than a graph.
//   * Colour means exactly one thing: destructive is BLOCKED, primary is the
//     current selection and its chain. Blocked is a tinted border and a single
//     dot rather than red text on every card — with dozens blocked, red prose
//     everywhere stops being a signal. Status is quiet text at all times.
//   * Epic clustering is a band behind each contiguous run of one epic's
//     stories in a column, labelled once. The nodes were already grouped; the
//     band is what makes the grouping visible.

import { useMemo, useState } from "react"
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react"

import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"

import { useStableFlowNodes } from "@/features/graph-canvas/use-stable-flow-nodes"

import {
  blockingChain,
  buildRoadmapEpicGraph,
  buildRoadmapGraph,
  type RoadmapGraph,
  type RoadmapGraphStory,
} from "./roadmap-graph"

import "@xyflow/react/dist/style.css"

const NODE_WIDTH = 232
const COLUMN_GAP = 84
const COLUMN_WIDTH = NODE_WIDTH + COLUMN_GAP
const NODE_HEIGHT = 52
const ROW_HEIGHT = 62
/** Room for a band's label plus air between two epics stacked in one column. */
const BAND_GAP = 30
const BAND_LABEL_OFFSET = 20
const BAND_PAD_X = 10

export type RoadmapGraphAltitude = "stories" | "epics"

interface StoryNodeData extends Record<string, unknown> {
  label: string
  status: string
  detail: string
  /** Rendered as "+N" when a collapse hid dependencies of this node. */
  hidden: number
  blocked: boolean
  dimmed: boolean
  onChain: boolean
  selected: boolean
}

interface BandNodeData extends Record<string, unknown> {
  label: string
  dimmed: boolean
}

type GraphNode = Node<StoryNodeData, "story"> | Node<BandNodeData, "epic-band">

// Hoisted: React Flow treats a new nodeTypes object as a type-table change and
// remounts every node, which is a second, independent source of flicker.
const nodeTypes: NodeTypes = {
  story: StoryFlowNode,
  "epic-band": EpicBandNode,
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
  const [altitude, setAltitude] = useState<RoadmapGraphAltitude>("stories")
  const [showShipped, setShowShipped] = useState(false)
  const [selected, setSelected] = useState<string | null>(initialStoryId ?? null)

  const graph = useMemo(
    () => buildRoadmapGraph(stories, { collapseShipped: !showShipped }),
    [stories, showShipped],
  )
  const epicGraph = useMemo(() => buildRoadmapEpicGraph(graph), [graph])
  const chain = useMemo(
    () => (selected ? blockingChain(graph, selected) : null),
    [graph, selected],
  )

  const derived = useMemo(() => {
    if (altitude === "epics") {
      const rowOf = new Map<number, number>()
      const flowNodes: GraphNode[] = epicGraph.nodes.map((epic) => {
        const row = rowOf.get(epic.depth) ?? 0
        rowOf.set(epic.depth, row + 1)
        const total = Object.values(epic.counts).reduce((a, b) => a + b, 0)
        return {
          id: epic.id,
          type: "story" as const,
          position: { x: epic.depth * COLUMN_WIDTH, y: row * (ROW_HEIGHT + 8) },
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          data: {
            label: epic.id,
            status: epic.status,
            detail: `${epic.title} · ${total} ${total === 1 ? "story" : "stories"}`,
            hidden: 0,
            blocked: epic.status === "blocked",
            dimmed: false,
            onChain: false,
            selected: false,
          },
        }
      })
      return {
        nodes: flowNodes,
        edges: epicGraph.edges.map((edge) => toFlowEdge(edge, true)),
      }
    }

    const { rows, bands } = layoutStories(graph)
    const bandNodes: GraphNode[] = bands.map((band) => ({
      id: `band:${band.key}`,
      type: "epic-band" as const,
      position: { x: band.x, y: band.y },
      draggable: false,
      selectable: false,
      focusable: false,
      width: NODE_WIDTH + BAND_PAD_X * 2,
      height: band.height,
      // A band is scenery: clicks belong to the pane underneath it, so
      // clicking away from a card still clears the selection.
      style: { pointerEvents: "none" as const },
      data: { label: band.label, dimmed: chain !== null },
    }))
    const storyNodes: GraphNode[] = graph.nodes.map((node) => ({
      id: node.id,
      type: "story" as const,
      position: rows.get(node.id) ?? { x: 0, y: 0 },
      // Declared, not measured: these cards are a fixed size, and a node that
      // arrives with dimensions is never hidden waiting for a ResizeObserver.
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      data: {
        label: node.id,
        status: node.status,
        detail: node.title,
        hidden: node.hiddenBlockers + node.hiddenBlocked,
        blocked: node.isBlocked,
        dimmed: chain ? !chain.highlighted.has(node.id) : false,
        onChain: chain ? chain.highlighted.has(node.id) : false,
        selected: node.id === selected,
      },
    }))

    return {
      // Bands first so they paint behind the cards they group.
      nodes: [...bandNodes, ...storyNodes],
      edges: graph.edges.map((edge) =>
        toFlowEdge(edge, chain ? chain.edges.has(edge.id) : true),
      ),
    }
  }, [altitude, graph, epicGraph, chain, selected])

  // Carries React Flow's own measurements across these re-derivations. Without
  // it every node is re-measured — and hidden for the frame that takes — on
  // every click and drag.
  const { nodes, onNodesChange } = useStableFlowNodes<GraphNode>(derived.nodes)

  const hiddenTotal = useMemo(
    () =>
      graph.nodes.reduce(
        (total, node) => total + node.hiddenBlockers + node.hiddenBlocked,
        0,
      ),
    [graph],
  )

  const select = (next: string | null) => {
    setSelected(next)
    onSelectStory?.(next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          {(["stories", "epics"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={altitude === value ? "secondary" : "ghost"}
              aria-pressed={altitude === value}
              onClick={() => {
                setAltitude(value)
                select(null)
              }}
            >
              {value === "stories" ? "Stories" : "Epics"}
            </Button>
          ))}
        </div>

        {altitude === "stories" ? (
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
            {altitude === "stories"
              ? "Select a story to trace its blocking chain. Blockers sit to the left."
              : "One node per lane. An arrow means the lane on the left gates the one on the right."}
          </p>
        )}

        {altitude === "stories" && hiddenTotal > 0 ? (
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
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.15}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_event, node) => {
              if (altitude === "epics" || node.type !== "story") return
              select(node.id === selected ? null : node.id)
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
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  )
}

interface BandBox {
  key: string
  label: string
  x: number
  y: number
  height: number
}

/**
 * Pixel placement for the story altitude.
 *
 * The projection already decided which column a story sits in and its order
 * within that column. This walks each column in that order, keeps a run of one
 * epic contiguous, and opens a gap between runs so a band's label has somewhere
 * to live — the tighter vertical rhythm David asked for, without letting two
 * epics touch.
 */
function layoutStories(graph: RoadmapGraph): {
  rows: Map<string, { x: number; y: number }>
  bands: BandBox[]
} {
  const columns = new Map<number, typeof graph.nodes>()
  for (const node of graph.nodes) {
    const bucket = columns.get(node.depth)
    if (bucket) (bucket as RoadmapGraph["nodes"][number][]).push(node)
    else columns.set(node.depth, [node])
  }

  const rows = new Map<string, { x: number; y: number }>()
  const bands: BandBox[] = []

  for (const [depth, bucket] of columns) {
    const ordered = [...bucket].sort((left, right) => left.lane - right.lane)
    const x = depth * COLUMN_WIDTH
    let y = 0
    let index = 0
    while (index < ordered.length) {
      const epicId = ordered[index]!.epicId
      const run = []
      while (index < ordered.length && ordered[index]!.epicId === epicId) {
        run.push(ordered[index]!)
        index += 1
      }
      const top = y
      for (const node of run) {
        rows.set(node.id, { x, y })
        y += ROW_HEIGHT
      }
      bands.push({
        key: `${depth}:${epicId}`,
        label: epicId,
        x: x - BAND_PAD_X,
        y: top - BAND_LABEL_OFFSET,
        height: run.length * ROW_HEIGHT + BAND_LABEL_OFFSET,
      })
      y += BAND_GAP
    }
  }

  return { rows, bands }
}

function toFlowEdge(
  edge: { id: string; source: string; target: string; binding: boolean },
  active: boolean,
): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    animated: false,
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
}

function StoryFlowNode({ data }: { data: StoryNodeData }) {
  return (
    <div
      className={cn(
        "flex size-full flex-col justify-center gap-0.5 rounded-md border bg-card px-3 py-2 text-left transition-opacity",
        // Blocked is the tinted edge of the card, not a shouted label.
        data.blocked ? "border-destructive/40" : "border-border",
        data.onChain && !data.selected && "border-primary/50",
        data.selected && "border-primary ring-1 ring-primary",
        data.dimmed && "opacity-20",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="h-1! w-1! border-0! bg-transparent! opacity-0"
      />
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
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="h-1! w-1! border-0! bg-transparent! opacity-0"
      />
    </div>
  )
}

function EpicBandNode({ data }: { data: BandNodeData }) {
  return (
    <div
      className={cn(
        "pointer-events-none size-full rounded-lg border border-dashed border-border/60 bg-muted/20 transition-opacity",
        data.dimmed && "opacity-40",
      )}
    >
      <span className="px-2 font-mono text-[10px] leading-4 text-muted-foreground">
        {data.label}
      </span>
    </div>
  )
}
