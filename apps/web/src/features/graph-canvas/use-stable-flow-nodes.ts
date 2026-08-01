"use client"

// Shared React Flow node-identity guard — the fix for canvas flicker.
//
// React Flow rebuilds its internal record for a node whenever the node object
// it receives is a different reference than last render (`adoptUserNodes` in
// @xyflow/system). The rebuilt record takes `measured` from the incoming
// object, and NodeWrapper renders any node without measured dimensions as
// `visibility: hidden` until the ResizeObserver fires again. Both canvases in
// this app derive their nodes from a document rather than holding them in
// React Flow's own state, so every selection and every drag frame handed React
// Flow brand-new objects and the entire graph blinked out for a frame — the
// flicker seen in the roadmap graph and in ReducerStudio alike.
//
// This hook carries measurement across derivations: it records the dimensions
// React Flow reports through `onNodesChange`, stamps them back onto derived
// nodes, and reuses the previous object outright when nothing about a node
// changed. Derived-node projection stays pure; only the measurement cache is
// stateful, and it is a cache, not state — nothing renders from it directly.
//
// This lives in apps/web rather than packages/ui deliberately: @xyflow/react is
// not in the UI package's dependency graph, both consumers are app routes, and
// this is interaction plumbing rather than a visual component. It earns a
// package the moment a consumer outside apps/web needs it.

import { useCallback, useMemo, useRef } from "react"
import type { Node, NodeChange } from "@xyflow/react"

interface Measured {
  width: number
  height: number
}

export interface StableFlowNodes<NodeType extends Node> {
  nodes: NodeType[]
  onNodesChange: (changes: NodeChange<NodeType>[]) => void
}

/**
 * Keep derived React Flow nodes stable enough that React Flow stops
 * re-measuring — and therefore stops hiding — them on every render.
 *
 * @param derived the freshly projected nodes, however the caller computes them
 * @param onChange further node changes the caller wants (drag positions, etc.)
 */
export function useStableFlowNodes<NodeType extends Node>(
  derived: readonly NodeType[],
  onChange?: (changes: NodeChange<NodeType>[]) => void,
): StableFlowNodes<NodeType> {
  const measured = useRef(new Map<string, Measured>())
  const previous = useRef(new Map<string, NodeType>())

  const nodes = useMemo(() => {
    const { nodes: stable, next } = reconcileFlowNodes(
      derived,
      measured.current,
      previous.current,
    )
    // Writing the cache here rather than in an effect keeps the returned array
    // and the cache derived from the same input in the same pass; re-running
    // this memo with identical input produces an identical result, so a
    // double-invoked render is a no-op.
    previous.current = next
    return stable
  }, [derived])

  const onNodesChange = useCallback(
    (changes: NodeChange<NodeType>[]) => {
      for (const change of changes) {
        if (change.type === "dimensions" && change.dimensions) {
          measured.current.set(change.id, change.dimensions)
        }
        if (change.type === "remove") measured.current.delete(change.id)
      }
      onChange?.(changes)
    },
    [onChange],
  )

  return { nodes, onNodesChange }
}

/**
 * The pure core: stamp known measurements onto derived nodes and reuse the
 * previous object for anything that did not change.
 *
 * Exported so the guarantee this whole module exists for — a node React Flow
 * has already measured is never handed back unmeasured — is testable without
 * a canvas.
 */
export function reconcileFlowNodes<NodeType extends Node>(
  derived: readonly NodeType[],
  measured: ReadonlyMap<string, Measured>,
  previous: ReadonlyMap<string, NodeType>,
): { nodes: NodeType[]; next: Map<string, NodeType> } {
  const next = new Map<string, NodeType>()
  const nodes = derived.map((node) => {
    const size = node.measured ?? measured.get(node.id)
    const candidate = size ? ({ ...node, measured: size } as NodeType) : node
    const prior = previous.get(node.id)
    const chosen = prior && isSameNode(prior, candidate) ? prior : candidate
    next.set(node.id, chosen)
    return chosen
  })
  return { nodes, next }
}

function isSameNode<NodeType extends Node>(
  left: NodeType,
  right: NodeType,
): boolean {
  if (
    left.type !== right.type ||
    left.position.x !== right.position.x ||
    left.position.y !== right.position.y ||
    left.selected !== right.selected ||
    left.hidden !== right.hidden ||
    // Declared dimensions are part of a node's shape, not just its content: a
    // node that resized while its data stayed identical must not be reused.
    left.width !== right.width ||
    left.height !== right.height ||
    left.measured?.width !== right.measured?.width ||
    left.measured?.height !== right.measured?.height
  ) {
    return false
  }
  return isShallowEqual(left.data, right.data)
}

function isShallowEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  if (left === right) return true
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => Object.is(left[key], right[key]))
}
