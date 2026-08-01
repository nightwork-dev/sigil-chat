"use client"

// Roadmap graph: the dependency reading of the same stories the board shows.
//
// Layout is computed in roadmap-graph.ts, not here — this file places what
// that projection decided and owns interaction only. Two altitudes over one
// data set: Stories (every story, epic-clustered) and Epics (one node per
// lane, the "what gates what" answer). Selecting a node lights its full
// blocking chain in both directions and dims everything else, which is the
// one-glance requirement.
//
// Colour means exactly one thing here: a node is tinted only when it is
// BLOCKED — the state that needs attention. Every other status is carried by
// a text label, because seven statuses as seven colours across ~160 nodes is
// a metro map, not a signal.

import { useMemo, useState } from "react"
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react"

import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"

import {
  blockingChain,
  buildRoadmapEpicGraph,
  buildRoadmapGraph,
  type RoadmapGraphStory,
} from "./roadmap-graph"

import "@xyflow/react/dist/style.css"

const COLUMN_WIDTH = 260
const ROW_HEIGHT = 92

export type RoadmapGraphAltitude = "stories" | "epics"

interface StoryNodeData extends Record<string, unknown> {
  label: string
  sublabel: string
  detail: string
  blocked: boolean
  dimmed: boolean
  selected: boolean
}

export function RoadmapGraphView({
  stories,
  onSelectStory,
}: {
  stories: readonly RoadmapGraphStory[]
  onSelectStory?: (storyId: string) => void
}) {
  const [altitude, setAltitude] = useState<RoadmapGraphAltitude>("stories")
  const [showShipped, setShowShipped] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const graph = useMemo(
    () => buildRoadmapGraph(stories, { collapseShipped: !showShipped }),
    [stories, showShipped],
  )
  const epicGraph = useMemo(() => buildRoadmapEpicGraph(graph), [graph])
  const chain = useMemo(
    () => (selected ? blockingChain(graph, selected) : null),
    [graph, selected],
  )

  const { nodes, edges } = useMemo(() => {
    if (altitude === "epics") {
      const laneOf = new Map<number, number>()
      const flowNodes: Node<StoryNodeData>[] = epicGraph.nodes.map((epic) => {
        const row = laneOf.get(epic.depth) ?? 0
        laneOf.set(epic.depth, row + 1)
        const total = Object.values(epic.counts).reduce((a, b) => a + b, 0)
        return {
          id: epic.id,
          position: { x: epic.depth * COLUMN_WIDTH, y: row * ROW_HEIGHT },
          data: {
            label: epic.title,
            sublabel: epic.status,
            detail: `${total} ${total === 1 ? "story" : "stories"}`,
            blocked: epic.status === "blocked",
            dimmed: false,
            selected: false,
          },
          type: "default",
        }
      })
      return {
        nodes: flowNodes,
        edges: epicGraph.edges.map((edge) => toFlowEdge(edge, true)),
      }
    }

    const flowNodes: Node<StoryNodeData>[] = graph.nodes.map((node) => ({
      id: node.id,
      position: { x: node.depth * COLUMN_WIDTH, y: node.lane * ROW_HEIGHT },
      data: {
        label: node.id,
        sublabel: node.status,
        detail: node.title,
        blocked: node.isBlocked,
        dimmed: chain ? !chain.highlighted.has(node.id) : false,
        selected: node.id === selected,
      },
      type: "default",
    }))
    return {
      nodes: flowNodes,
      edges: graph.edges.map((edge) =>
        toFlowEdge(edge, chain ? chain.edges.has(edge.id) : true),
      ),
    }
  }, [altitude, graph, epicGraph, chain, selected])

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
                setSelected(null)
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
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
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
          <ReactFlow<Node<StoryNodeData>>
            nodes={nodes}
            edges={edges}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesFocusable={false}
            fitView
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_event, node) => {
              if (altitude === "epics") return
              const next = node.id === selected ? null : node.id
              setSelected(next)
              if (next) onSelectStory?.(next)
            }}
            onPaneClick={() => setSelected(null)}
            nodeTypes={{ default: StoryFlowNode }}
          >
            <Background gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  )
}

function toFlowEdge(
  edge: { id: string; source: string; target: string; binding: boolean },
  active: boolean,
): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: false,
    // A satisfied dependency is history, not a live constraint — it stays
    // visible so the chain is complete, but dashed so it stops competing.
    style: {
      strokeDasharray: edge.binding ? undefined : "4 4",
      opacity: active ? (edge.binding ? 0.9 : 0.45) : 0.12,
    },
  }
}

function StoryFlowNode({ data }: { data: StoryNodeData }) {
  return (
    <div
      className={cn(
        "w-56 rounded-md border bg-card px-2.5 py-2 text-left transition-opacity",
        data.blocked ? "border-destructive/60" : "border-border",
        data.selected && "ring-2 ring-primary",
        data.dimmed && "opacity-25",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs font-medium text-foreground">
          {data.label}
        </span>
        <span
          className={cn(
            "text-xs",
            data.blocked ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {data.blocked ? "blocked" : data.sublabel}
        </span>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {data.detail}
      </p>
    </div>
  )
}
