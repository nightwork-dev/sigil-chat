// View: Workflow / DAG editor
// Canonical content surface: static node-based workflow with SVG connectors.
// Fills any Layout content region (hosted in MenubarShell).
// Decoupled — no props, no router/app coupling.

import { Card, CardContent, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { ZoomInIcon, ZoomOutIcon, PlusIcon, MaximizeIcon } from "lucide-react"
import { dotGrid } from "@workspace/ui/lib/patterns"

interface WorkflowNode {
  id: string
  label: string
  type: "trigger" | "process" | "output"
  x: number
  y: number
  description: string
}

interface WorkflowEdge {
  from: string
  to: string
}

const nodes: WorkflowNode[] = [
  { id: "trigger", label: "HTTP Request", type: "trigger", x: 60, y: 80, description: "POST /api/ingest" },
  { id: "validate", label: "Validate", type: "process", x: 300, y: 40, description: "Schema check" },
  { id: "transform", label: "Transform", type: "process", x: 300, y: 160, description: "Normalize fields" },
  { id: "enrich", label: "Enrich", type: "process", x: 540, y: 100, description: "Add metadata" },
  { id: "store", label: "Write DB", type: "output", x: 760, y: 60, description: "SurrealDB upsert" },
  { id: "notify", label: "Notify", type: "output", x: 760, y: 160, description: "WebSocket push" },
]

const edges: WorkflowEdge[] = [
  { from: "trigger", to: "validate" },
  { from: "trigger", to: "transform" },
  { from: "validate", to: "enrich" },
  { from: "transform", to: "enrich" },
  { from: "enrich", to: "store" },
  { from: "enrich", to: "notify" },
]

const nodeColors = {
  trigger: { border: "border-chart-1/40", bg: "bg-chart-1/5", dot: "bg-chart-1" },
  process: { border: "border-chart-2/40", bg: "bg-chart-2/5", dot: "bg-chart-2" },
  output: { border: "border-chart-3/40", bg: "bg-chart-3/5", dot: "bg-chart-3" },
} as const

const NODE_W = 180
const NODE_H = 64

function getNodeCenter(node: WorkflowNode) {
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 }
}

function EdgePath({ from, to }: { from: WorkflowNode; to: WorkflowNode }) {
  const start = getNodeCenter(from)
  const end = getNodeCenter(to)

  // Right edge of source -> left edge of target
  const sx = from.x + NODE_W
  const sy = start.y
  const ex = to.x
  const ey = end.y
  const mx = sx + (ex - sx) / 2

  return (
    <path
      d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`}
      fill="none"
      stroke="var(--color-border)"
      strokeWidth={1.5}
      strokeDasharray="4 3"
    />
  )
}

export function WorkflowView() {
  const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]))

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <Button variant="ghost" size="icon-xs">
          <ZoomInIcon className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs">
          <ZoomOutIcon className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs">
          <MaximizeIcon className="size-3.5" />
        </Button>
        <Separator orientation="vertical" className="h-4 mx-1" />
        <Button variant="ghost" size="xs" className="gap-1.5 text-xs">
          <PlusIcon className="size-3" />
          Add Node
        </Button>
        <div className="ml-auto">
          <Badge variant="outline" className="font-mono text-[10px]">
            {nodes.length} nodes
          </Badge>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="relative flex-1 overflow-auto"
        style={dotGrid()}
      >
        {/* SVG edges */}
        <svg className="absolute inset-0 h-full w-full pointer-events-none">
          {edges.map((edge) => (
            <EdgePath
              key={`${edge.from}-${edge.to}`}
              from={nodesById[edge.from]}
              to={nodesById[edge.to]}
            />
          ))}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => {
          const colors = nodeColors[node.type]
          return (
            <div
              key={node.id}
              className="absolute"
              style={{ left: node.x, top: node.y, width: NODE_W }}
            >
              <Card size="sm" className={`${colors.border} ${colors.bg} cursor-default`}>
                <CardHeader className="py-1.5 px-2.5">
                  <CardTitle className="flex items-center gap-1.5 text-xs">
                    <span className={`size-1.5 rounded-full ${colors.dot}`} />
                    {node.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2.5 pb-2">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {node.description}
                  </span>
                </CardContent>
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}
