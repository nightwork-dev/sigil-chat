"use client"

// The cross-lane dependency edge.
//
// Links between lanes are the structural edges of this map — they are what the
// epic-level layering is computed from, and the only edges that can stand for
// several underlying dependencies at once. They get their own component so the
// aggregation count can ride ON the line rather than in React Flow's generic
// label slot, which renders under the edge and cannot be styled as a chip.
//
// Within a lane an edge is a short hop between neighbouring cards and stays on
// the built-in smoothstep renderer: quiet, thin, unlabelled. The visual
// difference between the two is deliberate — a line leaving its lane means
// something a line inside a lane does not.

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from "@xyflow/react"
import type { EdgeProps } from "@xyflow/react"

export interface CrossLaneEdgeData extends Record<string, unknown> {
  /** How many story-level dependencies this one line stands for. */
  count: number
  stroke: string
  binding: boolean
  /** On a goal path or on the selected story's chain. */
  emphasis: boolean
  /** Off the current selection's chain entirely. */
  faded: boolean
}

export function CrossLaneEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
  pathOptions,
}: EdgeProps & {
  data?: CrossLaneEdgeData
  pathOptions?: { offset?: number; borderRadius?: number }
}) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    // The offset is this edge's lane in the gutter: parallel runs turn at
    // different distances so they sit side by side instead of on one trunk.
    offset: pathOptions?.offset ?? 30,
    borderRadius: pathOptions?.borderRadius ?? 12,
  })

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {data && data.count > 1 ? (
        <EdgeLabelRenderer>
          <div
            // `nodrag nopan` so grabbing the chip doesn't drag the canvas out
            // from under the pointer.
            className="nodrag nopan pointer-events-none absolute rounded-sm border border-border bg-background px-1 font-mono text-[10px] leading-4 text-muted-foreground"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity: data.faded ? 0.2 : 1,
              borderColor: data.emphasis ? data.stroke : undefined,
              color: data.emphasis ? data.stroke : undefined,
            }}
            title={`${data.count} dependencies between these lanes`}
          >
            ×{data.count}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
