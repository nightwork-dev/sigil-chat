// NodeDiagram — a compact, static SVG of a small hypergraph: nodes plus
// hub-style relations that can touch more than two nodes (so a relation
// can't be a single line between two points — it's drawn as its own small
// hub, with every node it touches connecting to that hub). Edges have no
// arrowheads by default — good for symmetric/undirected relations; for
// directed graphs at any real scale, reach for GraphCanvas instead.
//
// Good for: small "teach the mental model" diagrams (docs, guides) — 2-4
// nodes, 1-3 relations. Node fill/stroke key off the shared ValueStatus
// language so it can sit next to RangeSlider/PinnableTrack and read as the
// same product.

import { cn } from "@workspace/ui/lib/utils"
import { isEmptyRange, isPointRange, type Range } from "@workspace/ui/lib/range"
import { svgPaint, type ValueStatus } from "@workspace/ui/lib/value-status"

export interface DiagramNode {
  id: string
  label: string
  status: ValueStatus
  /** Optional inline range track inside the node (needs showRange on the diagram). */
  value?: Range
  domain?: [number, number]
}

export interface DiagramRelation {
  /** Short symbol shown inside the hub: "=", "+", "×", "min", "max", "f(x)"… */
  symbol: string
  /** Node ids this relation touches. First is conventionally the "result". */
  nodes: string[]
}

interface NodeDiagramProps {
  nodes: DiagramNode[]
  relations: DiagramRelation[]
  /** Render a tiny range track inside bounded/pinned node boxes. */
  showRange?: boolean
  className?: string
}

const CW = 58
const CH = 28
const RANGE_H = 8
const HUB_R = 11
const GAP_H = 70
const GAP_B = 26
const ROW_GAP = 34
const GAP_V = 30
const PAD = 8

interface Box {
  cx: number
  cy: number
}
interface Hub {
  cx: number
  cy: number
  symbol: string
  nodeIds: string[]
}
interface Layout {
  width: number
  height: number
  nodePos: Map<string, Box>
  hubs: Hub[]
}

function layout(nodes: DiagramNode[], relations: DiagramRelation[], nodeH: number): Layout {
  const nodePos = new Map<string, Box>()
  const hubs: Hub[] = []

  if (relations.length === 1) {
    const rel = relations[0]!
    const ids = rel.nodes
    if (ids.length <= 2) {
      const width = CW * 2 + GAP_H
      const cy = nodeH / 2
      nodePos.set(ids[0]!, { cx: CW / 2, cy })
      if (ids[1]) nodePos.set(ids[1], { cx: width - CW / 2, cy })
      hubs.push({ cx: width / 2, cy, symbol: rel.symbol, nodeIds: ids })
      return { width, height: nodeH, nodePos, hubs }
    }
    const operands = ids.slice(1)
    const width = operands.length * CW + (operands.length - 1) * GAP_B
    const opY = nodeH + ROW_GAP + nodeH / 2
    operands.forEach((id, i) => {
      nodePos.set(id, { cx: i * (CW + GAP_B) + CW / 2, cy: opY })
    })
    nodePos.set(ids[0]!, { cx: width / 2, cy: nodeH / 2 })
    hubs.push({ cx: width / 2, cy: nodeH + ROW_GAP / 2, symbol: rel.symbol, nodeIds: ids })
    return { width, height: nodeH * 2 + ROW_GAP, nodePos, hubs }
  }

  const step = nodeH + GAP_V
  nodes.forEach((n, i) => {
    nodePos.set(n.id, { cx: CW / 2, cy: i * step + nodeH / 2 })
  })
  for (const rel of relations) {
    const ys = rel.nodes.map((id) => nodePos.get(id)?.cy).filter((y): y is number => y != null)
    const cy = ys.reduce((a, b) => a + b, 0) / (ys.length || 1)
    const idxs = rel.nodes.map((id) => nodes.findIndex((n) => n.id === id))
    const adjacent = idxs.length === 2 && Math.abs(idxs[0]! - idxs[1]!) === 1
    hubs.push({ cx: adjacent ? CW / 2 : CW + 28, cy, symbol: rel.symbol, nodeIds: rel.nodes })
  }
  const height = (nodes.length - 1) * step + nodeH
  const width = hubs.some((h) => h.cx > CW) ? CW + 28 + HUB_R : CW
  return { width, height, nodePos, hubs }
}

// the point on a node's perimeter closest to the hub, so edges meet the box
// edge rather than its center.
function anchor(node: Box, hub: Hub, nodeH: number): { x: number; y: number } {
  const dx = hub.cx - node.cx
  const dy = hub.cy - node.cy
  const hw = CW / 2
  const hh = nodeH / 2
  const sx = dx === 0 ? 0 : Math.sign(dx)
  const sy = dy === 0 ? 0 : Math.sign(dy)
  if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
    return { x: node.cx + sx * hw, y: node.cy + (dy / (Math.abs(dx) || 1)) * hw }
  }
  return { x: node.cx + (dx / (Math.abs(dy) || 1)) * hh, y: node.cy + sy * hh }
}

function NodeDiagram({ nodes, relations, showRange = false, className }: NodeDiagramProps) {
  const anyRange = showRange && nodes.some((n) => n.value && n.domain)
  const nodeH = CH + (anyRange ? RANGE_H : 0)
  const { width, height, nodePos, hubs } = layout(nodes, relations, nodeH)
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const vbW = width + PAD * 2
  const vbH = height + PAD * 2

  return (
    <figure
      data-slot="node-diagram"
      className={cn("my-5 flex justify-center rounded-lg border border-border bg-card/40 px-4 py-5", className)}
    >
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        width={vbW}
        height={vbH}
        className="max-w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label={relations.map((r) => `${r.symbol}(${r.nodes.join(", ")})`).join("; ") || "node diagram"}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {hubs.flatMap((hub) =>
            hub.nodeIds.map((id) => {
              const node = nodePos.get(id)
              if (!node) return null
              const nd = byId.get(id)
              const conflicting = nd?.status === "conflicting"
              const a = anchor(node, hub, nodeH)
              return (
                <line
                  key={`${hub.symbol}-${id}-${hub.cx}-${hub.cy}`}
                  x1={a.x}
                  y1={a.y}
                  x2={hub.cx}
                  y2={hub.cy}
                  stroke={conflicting ? "var(--color-destructive)" : "currentColor"}
                  strokeOpacity={conflicting ? 0.3 : 0.2}
                  strokeWidth={1}
                />
              )
            })
          )}

          {hubs.map((hub) => {
            const touchesConflict = hub.nodeIds.some((id) => byId.get(id)?.status === "conflicting")
            return (
              <g key={`hub-${hub.cx}-${hub.cy}`}>
                <circle cx={hub.cx} cy={hub.cy} r={HUB_R} fill={touchesConflict ? "var(--color-destructive)" : "var(--color-muted)"} fillOpacity={touchesConflict ? 0.15 : 0.5} />
                <text x={hub.cx} y={hub.cy} textAnchor="middle" dominantBaseline="central" fontSize={hub.symbol.length > 2 ? 7 : 9} fontFamily="var(--font-mono, ui-monospace, monospace)" fill="currentColor" opacity={0.75}>
                  {hub.symbol}
                </text>
              </g>
            )
          })}

          {nodes.map((n) => {
            const pos = nodePos.get(n.id)
            if (!pos) return null
            const p = svgPaint(n.status)
            const x = pos.cx - CW / 2
            const y = pos.cy - nodeH / 2
            const conflicting = n.status === "conflicting"
            const labelY = anyRange ? y + (nodeH - RANGE_H) / 2 : pos.cy
            return (
              <g key={n.id}>
                <rect x={x} y={y} width={CW} height={nodeH} rx={6} fill={p.fill} fillOpacity={p.fillOpacity} stroke={p.stroke} strokeOpacity={p.strokeOpacity} strokeWidth={1.25} strokeDasharray={p.dashed ? "2 3" : undefined} />
                <text x={pos.cx} y={labelY} textAnchor="middle" dominantBaseline="central" fontSize={11} fontFamily="var(--font-mono, ui-monospace, monospace)" fill={p.label}>
                  {conflicting ? `${n.label} ⊥` : n.label}
                </text>
                {anyRange && n.value && n.domain ? <RangeBar value={n.value} domain={n.domain} x={x + 6} y={y + nodeH - 6} w={CW - 12} /> : null}
              </g>
            )
          })}
        </g>
      </svg>
    </figure>
  )
}

// a 2px inline range track drawn inside a node box.
function RangeBar({ value, domain, x, y, w }: { value: Range; domain: [number, number]; x: number; y: number; w: number }) {
  const [min, max] = domain
  const span = max - min || 1
  const clamp = (v: number) => Math.max(0, Math.min(1, (v - min) / span))
  if (isEmptyRange(value)) {
    return <rect x={x} y={y} width={w} height={2} rx={1} fill="var(--color-destructive)" fillOpacity={0.6} />
  }
  const lo = clamp(Number.isFinite(value.lo) ? value.lo : min)
  const hi = clamp(Number.isFinite(value.hi) ? value.hi : max)
  const point = isPointRange(value)
  return (
    <>
      <rect x={x} y={y} width={w} height={2} rx={1} fill="var(--color-muted-foreground)" fillOpacity={0.25} />
      <rect x={x + lo * w} y={y} width={Math.max(point ? 1.5 : 0, (hi - lo) * w)} height={2} rx={1} fill="var(--color-primary)" fillOpacity={0.8} />
    </>
  )
}

export { NodeDiagram }
export type { NodeDiagramProps }
