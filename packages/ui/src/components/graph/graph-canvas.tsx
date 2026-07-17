"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"
import { useThemeColors } from "@workspace/ui/hooks/use-theme-colors"

// ============================================================================
// Types
// ============================================================================

interface GraphNode {
  id: number
  label: string
  group: number
  position: { x: number; y: number }
  velocity: { x: number; y: number }
  pinned: boolean
  icon?: string
  depth: number
}

type GraphEdgeType = "dependency" | "association" | "sequence"

interface GraphEdge {
  id: number
  source: number
  target: number
  weight: number
  type: GraphEdgeType
}

type GraphLayout = "force-directed" | "hierarchical" | "radial"

type GraphVisualStyle = "knowledge-graph" | "skill-tree" | "flowchart" | "narrative-flow"

// ============================================================================
// Style presets
// ============================================================================

type NodeShape = "circle" | "rounded-rect" | "diamond"
type EdgeStyle = "straight" | "bezier" | "orthogonal"

interface StyleConfig {
  nodeColors: string[]
  edgeColor: string
  backgroundColor: string
  nodeShape: NodeShape
  edgeStyle: EdgeStyle
  labelFont: string
  labelUppercased: boolean
  showArrows: boolean
  nodeBaseRadius: number
}

const STYLE_CONFIGS: Record<GraphVisualStyle, StyleConfig> = {
  "knowledge-graph": {
    nodeColors: ["#d4a147", "#73a659", "#b84738", "#6185b3", "#8c66a6"],
    edgeColor: "rgba(255,255,255,0.15)",
    backgroundColor: "theme",
    nodeShape: "circle",
    edgeStyle: "straight",
    labelFont: '500 8px ui-monospace, "Cascadia Code", "Source Code Pro", monospace',
    labelUppercased: true,
    showArrows: true,
    nodeBaseRadius: 5,
  },
  "skill-tree": {
    nodeColors: ["#d4a853", "#53b88a", "#5ba8c4", "#c084fc", "#807870"],
    edgeColor: "rgba(212,168,83,0.3)",
    backgroundColor: "#0a0910",
    nodeShape: "rounded-rect",
    edgeStyle: "straight",
    labelFont: '700 9px ui-monospace, "Cascadia Code", "Source Code Pro", monospace',
    labelUppercased: false,
    showArrows: true,
    nodeBaseRadius: 8,
  },
  flowchart: {
    nodeColors: ["#5ba8c4", "#53b88a", "#d4a853", "#e5484d", "#9b7acf"],
    edgeColor: "rgba(255,255,255,0.25)",
    backgroundColor: "#0c0e14",
    nodeShape: "rounded-rect",
    edgeStyle: "orthogonal",
    labelFont: '500 8px ui-monospace, "Cascadia Code", "Source Code Pro", monospace',
    labelUppercased: false,
    showArrows: true,
    nodeBaseRadius: 10,
  },
  "narrative-flow": {
    nodeColors: ["#c4887a", "#d4a853", "#8b7acf", "#53b88a", "#807870"],
    edgeColor: "rgba(196,136,122,0.2)",
    backgroundColor: "#0e0b10",
    nodeShape: "circle",
    edgeStyle: "bezier",
    labelFont: '400 9px ui-serif, Georgia, "Times New Roman", serif',
    labelUppercased: false,
    showArrows: false,
    nodeBaseRadius: 6,
  },
}

// ============================================================================
// Graph state hook
// ============================================================================

interface GraphState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  layout: GraphLayout
  visualStyle: GraphVisualStyle
  repulsion: number
  attraction: number
  damping: number
  idealLength: number
  isRunning: boolean
  selectedNode: number | null
}

interface GraphActions {
  setNodes: (nodes: GraphNode[]) => void
  setEdges: (edges: GraphEdge[]) => void
  setLayout: (layout: GraphLayout) => void
  setVisualStyle: (style: GraphVisualStyle) => void
  setSelectedNode: (id: number | null) => void
  setPhysics: (params: Partial<Pick<GraphState, "repulsion" | "attraction" | "damping" | "idealLength">>) => void
  applyLayout: (layout: GraphLayout) => void
}

function useGraphState(
  initialNodes: GraphNode[] = [],
  initialEdges: GraphEdge[] = [],
): GraphState & GraphActions {
  const [state, setState] = React.useState<GraphState>(() => {
    // Ensure all nodes have position and velocity data
    const nodes = initialNodes.map((n, i) => {
      // { x: 0, y: 0 } is the caller's "unset — scatter me" sentinel (see showcase data),
      // so treat coincident-with-origin as unset too, not just missing/non-numeric.
      const hasPosition =
        n.position &&
        typeof n.position.x === "number" &&
        typeof n.position.y === "number" &&
        (n.position.x !== 0 || n.position.y !== 0)
      const angle = (i / Math.max(initialNodes.length, 1)) * Math.PI * 2
      const r = 120 + (Math.random() - 0.5) * 60
      return {
        ...n,
        position: hasPosition ? n.position : { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
        velocity: n.velocity ?? { x: 0, y: 0 },
      }
    })
    return {
      nodes,
      edges: initialEdges,
      layout: "force-directed" as GraphLayout,
      visualStyle: "knowledge-graph" as GraphVisualStyle,
      repulsion: 800,
      attraction: 0.008,
      damping: 0.88,
      idealLength: 80,
      isRunning: true,
      selectedNode: null,
    }
  })

  const rafRef = React.useRef<number>(0)
  const lastTimeRef = React.useRef<number>(0)

  // Physics tick
  const tick = React.useCallback((timestamp: number) => {
    const dt = lastTimeRef.current ? Math.min((timestamp - lastTimeRef.current) / 1000, 0.032) : 0.016
    lastTimeRef.current = timestamp

    setState((prev) => {
      if (!prev.isRunning || prev.layout !== "force-directed") return prev

      const nodes = prev.nodes.map((n) => ({
        ...n,
        velocity: { ...n.velocity },
        position: { ...n.position },
      }))

      // Repulsion (node-node)
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].pinned) continue
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue
          const dx = nodes[i].position.x - nodes[j].position.x
          const dy = nodes[i].position.y - nodes[j].position.y
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
          const force = prev.repulsion / (dist * dist)
          nodes[i].velocity.x += (dx / dist) * force * dt
          nodes[i].velocity.y += (dy / dist) * force * dt
        }
      }

      // Attraction (edges)
      for (const edge of prev.edges) {
        const src = nodes[edge.source]
        const tgt = nodes[edge.target]
        if (!src?.position || !tgt?.position) continue
        const dx = tgt.position.x - src.position.x
        const dy = tgt.position.y - src.position.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const displacement = dist - prev.idealLength
        const force = prev.attraction * displacement * edge.weight
        const dirX = dx / Math.max(dist, 1)
        const dirY = dy / Math.max(dist, 1)

        if (!src.pinned) {
          src.velocity.x += dirX * force * dt
          src.velocity.y += dirY * force * dt
        }
        if (!tgt.pinned) {
          tgt.velocity.x -= dirX * force * dt
          tgt.velocity.y -= dirY * force * dt
        }
      }

      // Center gravity + integrate
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].pinned) continue
        nodes[i].velocity.x -= nodes[i].position.x * 0.02 * dt
        nodes[i].velocity.y -= nodes[i].position.y * 0.02 * dt
        nodes[i].velocity.x *= prev.damping
        nodes[i].velocity.y *= prev.damping
        nodes[i].position.x += nodes[i].velocity.x * dt * 60
        nodes[i].position.y += nodes[i].velocity.y * dt * 60
      }

      return { ...prev, nodes }
    })

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  React.useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [tick])

  // Layout algorithms
  const assignDepths = React.useCallback((nodes: GraphNode[], edges: GraphEdge[]) => {
    const hasIncoming = new Set<number>()
    for (const edge of edges) hasIncoming.add(edge.target)

    const roots: number[] = []
    for (let i = 0; i < nodes.length; i++) {
      if (!hasIncoming.has(i)) roots.push(i)
    }
    if (roots.length === 0 && nodes.length > 0) roots.push(0)

    const visited = new Set<number>()
    const queue = [...roots]
    for (const root of roots) {
      nodes[root].depth = 0
      visited.add(root)
    }

    const adjacency: Record<number, number[]> = {}
    for (const edge of edges) {
      if (!adjacency[edge.source]) adjacency[edge.source] = []
      adjacency[edge.source].push(edge.target)
    }

    let head = 0
    while (head < queue.length) {
      const current = queue[head++]
      for (const neighbor of adjacency[current] ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          nodes[neighbor].depth = nodes[current].depth + 1
          queue.push(neighbor)
        } else {
          nodes[neighbor].depth = Math.max(nodes[neighbor].depth, nodes[current].depth + 1)
        }
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      if (!visited.has(i)) nodes[i].depth = 0
    }
  }, [])

  const applyLayout = React.useCallback(
    (layout: GraphLayout) => {
      setState((prev) => {
        const nodes = prev.nodes.map((n) => ({ ...n, velocity: { x: 0, y: 0 }, position: { ...n.position } }))

        if (layout === "force-directed") {
          // Scatter in a ring
          for (let i = 0; i < nodes.length; i++) {
            const angle = (i / nodes.length) * Math.PI * 2
            const r = 120 + (Math.random() - 0.5) * 60
            nodes[i].position = { x: Math.cos(angle) * r, y: Math.sin(angle) * r }
          }
          return { ...prev, nodes, layout, isRunning: true }
        }

        assignDepths(nodes, prev.edges)

        if (layout === "hierarchical") {
          const levels: Record<number, number[]> = {}
          for (let i = 0; i < nodes.length; i++) {
            const d = nodes[i].depth
            if (!levels[d]) levels[d] = []
            levels[d].push(i)
          }
          const maxDepth = Math.max(...Object.keys(levels).map(Number), 0)

          for (const [depthStr, indices] of Object.entries(levels)) {
            const depth = Number(depthStr)
            const count = indices.length
            const totalWidth = (count - 1) * 90
            for (let col = 0; col < indices.length; col++) {
              nodes[indices[col]].position = {
                x: col * 90 - totalWidth * 0.5,
                y: depth * 100 - maxDepth * 100 * 0.5,
              }
            }
          }
          return { ...prev, nodes, layout, isRunning: false }
        }

        // Radial
        const rings: Record<number, number[]> = {}
        for (let i = 0; i < nodes.length; i++) {
          const d = nodes[i].depth
          if (!rings[d]) rings[d] = []
          rings[d].push(i)
        }

        for (const [ringStr, indices] of Object.entries(rings)) {
          const ring = Number(ringStr)
          const count = indices.length
          const radius = ring === 0 ? (count > 1 ? 20 : 0) : ring * 80
          for (let i = 0; i < indices.length; i++) {
            const angle = (i / count) * Math.PI * 2
            nodes[indices[i]].position = {
              x: Math.cos(angle) * radius,
              y: Math.sin(angle) * radius,
            }
          }
        }
        return { ...prev, nodes, layout, isRunning: false }
      })
    },
    [assignDepths],
  )

  const actions: GraphActions = React.useMemo(
    () => ({
      setNodes: (nodes) => setState((s) => ({ ...s, nodes })),
      setEdges: (edges) => setState((s) => ({ ...s, edges })),
      setLayout: (layout) => setState((s) => ({ ...s, layout })),
      setVisualStyle: (visualStyle) => setState((s) => ({ ...s, visualStyle })),
      setSelectedNode: (selectedNode) => setState((s) => ({ ...s, selectedNode })),
      setPhysics: (params) => setState((s) => ({ ...s, ...params })),
      applyLayout,
    }),
    [applyLayout],
  )

  return { ...state, ...actions }
}

// ============================================================================
// GraphCanvas component
// ============================================================================

interface GraphCanvasProps {
  state: GraphState & GraphActions
  className?: string
}

function GraphCanvas({ state, className }: GraphCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const offsetRef = React.useRef({ x: 0, y: 0 })
  const scaleRef = React.useRef(1)
  const dragStartRef = React.useRef({ x: 0, y: 0 })
  const panStartRef = React.useRef({ x: 0, y: 0 })
  const isPanning = React.useRef(false)
  const [, forceRender] = React.useState(0)

  const themeColors = useThemeColors()
  const config = STYLE_CONFIGS[state.visualStyle]

  // Resolve backgroundColor — "theme" sentinel uses the resolved CSS background
  const resolvedBg = config.backgroundColor === "theme" ? themeColors.background : config.backgroundColor

  // Render loop
  React.useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let raf: number

    const render = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = rect.width
      const h = rect.height

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
      }

      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.save()
      ctx.scale(dpr, dpr)

      // Background
      ctx.fillStyle = resolvedBg
      ctx.fillRect(0, 0, w, h)

      const cx = w * 0.5 + offsetRef.current.x
      const cy = h * 0.5 + offsetRef.current.y
      const scale = scaleRef.current

      const toScreen = (pos: { x: number; y: number }) => ({
        x: cx + pos.x * scale,
        y: cy + pos.y * scale,
      })

      // Edges
      for (const edge of state.edges) {
        const src = state.nodes[edge.source]
        const tgt = state.nodes[edge.target]
        if (!src?.position || !tgt?.position) continue
        const srcPt = toScreen(src.position)
        const tgtPt = toScreen(tgt.position)

        const srcColor = config.nodeColors[src.group % config.nodeColors.length]
        const eColor =
          config.edgeStyle === "straight"
            ? hexWithAlpha(srcColor, edge.weight * 0.4)
            : config.edgeColor

        ctx.strokeStyle = eColor
        ctx.lineWidth = 1
        ctx.beginPath()

        if (config.edgeStyle === "straight") {
          ctx.moveTo(srcPt.x, srcPt.y)
          ctx.lineTo(tgtPt.x, tgtPt.y)
        } else if (config.edgeStyle === "bezier") {
          ctx.moveTo(srcPt.x, srcPt.y)
          const midY = (srcPt.y + tgtPt.y) * 0.5
          ctx.bezierCurveTo(srcPt.x, midY, tgtPt.x, midY, tgtPt.x, tgtPt.y)
        } else {
          // orthogonal
          const midY = (srcPt.y + tgtPt.y) * 0.5
          ctx.moveTo(srcPt.x, srcPt.y)
          ctx.lineTo(srcPt.x, midY)
          ctx.lineTo(tgtPt.x, midY)
          ctx.lineTo(tgtPt.x, tgtPt.y)
        }
        ctx.stroke()

        // Arrowheads
        if (config.showArrows) {
          drawArrowhead(ctx, srcPt, tgtPt, config, scale)
        }
      }

      // Nodes
      const nodeRadius = Math.max(3, Math.min(14, config.nodeBaseRadius * scale))

      for (const node of state.nodes) {
        if (!node.position) continue
        const pt = toScreen(node.position)
        const color = config.nodeColors[node.group % config.nodeColors.length]
        const r = state.selectedNode === node.id ? nodeRadius * 1.3 : nodeRadius

        if (config.nodeShape === "circle") {
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = hexWithAlpha(color, 0.3)
          ctx.lineWidth = 0.5
          ctx.stroke()
        } else if (config.nodeShape === "rounded-rect") {
          const rw = r * 2.4
          const rh = r * 1.6
          const cr = r * 0.3
          ctx.fillStyle = hexWithAlpha(color, 0.2)
          roundRect(ctx, pt.x - rw / 2, pt.y - rh / 2, rw, rh, cr)
          ctx.fill()
          ctx.strokeStyle = color
          ctx.lineWidth = 1
          roundRect(ctx, pt.x - rw / 2, pt.y - rh / 2, rw, rh, cr)
          ctx.stroke()
        } else {
          // diamond
          ctx.fillStyle = hexWithAlpha(color, 0.15)
          ctx.beginPath()
          ctx.moveTo(pt.x, pt.y - r)
          ctx.lineTo(pt.x + r, pt.y)
          ctx.lineTo(pt.x, pt.y + r)
          ctx.lineTo(pt.x - r, pt.y)
          ctx.closePath()
          ctx.fill()
          ctx.strokeStyle = color
          ctx.lineWidth = 1
          ctx.stroke()
        }

        // Label with LOD
        if (scale > 0.4) {
          const labelText = config.labelUppercased ? node.label.toUpperCase() : node.label
          const alpha = scale > 0.7 ? 1 : (scale - 0.4) / 0.3
          ctx.fillStyle = hexWithAlpha(color, alpha)
          ctx.font = config.labelFont
          ctx.textBaseline = "middle"
          ctx.textAlign = "left"
          ctx.fillText(labelText, pt.x + r + 5, pt.y - 1)
        }
      }

      ctx.restore()
      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [state.nodes, state.edges, state.visualStyle, state.selectedNode, config, resolvedBg])

  // Pan gesture
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    isPanning.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    panStartRef.current = { ...offsetRef.current }
  }, [])

  const handlePointerMove = React.useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return
    offsetRef.current = {
      x: panStartRef.current.x + (e.clientX - dragStartRef.current.x),
      y: panStartRef.current.y + (e.clientY - dragStartRef.current.y),
    }
  }, [])

  const handlePointerUp = React.useCallback(() => {
    isPanning.current = false
  }, [])

  // Zoom gesture
  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    scaleRef.current = Math.max(0.2, Math.min(4, scaleRef.current * delta))
    forceRender((n) => n + 1)
  }, [])

  return (
    <div
      ref={containerRef}
      data-slot="graph-canvas"
      className={cn("relative h-full w-full overflow-hidden", className)}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      />
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function hexWithAlpha(hex: string, alpha: number): string {
  // Handle rgba strings passthrough
  if (hex.startsWith("rgba") || hex.startsWith("var(")) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  config: StyleConfig,
  scale: number,
) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len <= 1) return

  const ux = dx / len
  const uy = dy / len
  const nr = Math.max(3, Math.min(14, config.nodeBaseRadius * scale))
  const tipX = to.x - ux * (nr + 2)
  const tipY = to.y - uy * (nr + 2)
  const aSize = Math.max(4, Math.min(8, 6 * scale))
  const baseX = tipX - ux * aSize
  const baseY = tipY - uy * aSize
  const px = -uy * aSize * 0.5
  const py = ux * aSize * 0.5

  ctx.fillStyle = "rgba(255,255,255,0.25)"
  ctx.beginPath()
  ctx.moveTo(tipX, tipY)
  ctx.lineTo(baseX + px, baseY + py)
  ctx.lineTo(baseX - px, baseY - py)
  ctx.closePath()
  ctx.fill()
}

export { GraphCanvas, useGraphState }
export type {
  GraphNode,
  GraphEdge,
  GraphEdgeType,
  GraphLayout,
  GraphVisualStyle,
  GraphCanvasProps,
}
