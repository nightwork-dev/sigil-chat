import { describe, expect, it } from "vitest"
import type { Node } from "@xyflow/react"

import { reconcileFlowNodes } from "./use-stable-flow-nodes"

type TestNode = Node<{ label: string; selected: boolean }>

function node(id: string, over: Partial<TestNode> = {}): TestNode {
  return {
    id,
    type: "test",
    position: { x: 0, y: 0 },
    data: { label: id, selected: false },
    ...over,
  }
}

describe("reconciling derived React Flow nodes", () => {
  it("stamps a known measurement onto a freshly derived node", () => {
    const measured = new Map([["A", { width: 200, height: 40 }]])

    const { nodes } = reconcileFlowNodes([node("A")], measured, new Map())

    // This is the whole point: React Flow renders a node with no measured
    // dimensions as `visibility: hidden` until it re-measures, so a node it
    // has already measured must never be handed back without them.
    expect(nodes[0]?.measured).toEqual({ width: 200, height: 40 })
  })

  it("reuses the previous object when nothing about a node changed", () => {
    const first = reconcileFlowNodes([node("A")], new Map(), new Map())
    const second = reconcileFlowNodes([node("A")], new Map(), first.next)

    expect(second.nodes[0]).toBe(first.nodes[0])
  })

  it("replaces the object when data, position, or size changed", () => {
    const first = reconcileFlowNodes([node("A")], new Map(), new Map())

    const moved = reconcileFlowNodes(
      [node("A", { position: { x: 10, y: 0 } })],
      new Map(),
      first.next,
    )
    const relabelled = reconcileFlowNodes(
      [node("A", { data: { label: "A", selected: true } })],
      new Map(),
      first.next,
    )
    const resized = reconcileFlowNodes(
      [node("A", { width: 300, height: 50 })],
      new Map(),
      first.next,
    )

    expect(moved.nodes[0]).not.toBe(first.nodes[0])
    expect(relabelled.nodes[0]?.data.selected).toBe(true)
    expect(resized.nodes[0]?.width).toBe(300)
  })

  it("keeps a measurement across a change to the node's data", () => {
    const measured = new Map([["A", { width: 200, height: 40 }]])
    const first = reconcileFlowNodes([node("A")], measured, new Map())

    const selected = reconcileFlowNodes(
      [node("A", { data: { label: "A", selected: true } })],
      measured,
      first.next,
    )

    // A selection changes the node object, which is exactly the moment the
    // canvas used to blink. The measurement has to survive it.
    expect(selected.nodes[0]).not.toBe(first.nodes[0])
    expect(selected.nodes[0]?.measured).toEqual({ width: 200, height: 40 })
  })

  it("prefers a measurement the node already carries", () => {
    const measured = new Map([["A", { width: 200, height: 40 }]])

    const { nodes } = reconcileFlowNodes(
      [node("A", { measured: { width: 240, height: 52 } })],
      measured,
      new Map(),
    )

    expect(nodes[0]?.measured).toEqual({ width: 240, height: 52 })
  })

  it("drops nodes that left the graph from the cache it hands forward", () => {
    const first = reconcileFlowNodes(
      [node("A"), node("B")],
      new Map(),
      new Map(),
    )
    const second = reconcileFlowNodes([node("A")], new Map(), first.next)

    expect([...second.next.keys()]).toEqual(["A"])
  })
})
