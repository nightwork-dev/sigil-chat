import type { NodeId, Position, Size } from "@workspace/graph/types"
import { createId } from "@workspace/graph/types"
import type { Reducer } from "@workspace/graph/reducer"
import { type Socket, createSocket } from "@workspace/graph/socket"

export interface Node {
  id: NodeId
  position: Position
  reducer: Reducer
  size?: Size
  label?: string
  inputs: Map<string, Socket>
  outputs: Map<string, Socket>
  error?: Error
  lastExecutionTime?: number
}

export function createNode(reducer: Reducer, position: Position): Node {
  return createNodeWithId(createId() as NodeId, reducer, position)
}

export function createNodeWithId(nodeId: NodeId, reducer: Reducer, position: Position): Node {
  const inputs = new Map<string, Socket>()
  const outputs = new Map<string, Socket>()

  for (const def of reducer.inputs) {
    inputs.set(def.name, createSocket(nodeId, def, "input"))
  }
  for (const def of reducer.outputs) {
    outputs.set(def.name, createSocket(nodeId, def, "output"))
  }

  return { id: nodeId, position, reducer, inputs, outputs, label: reducer.name }
}
