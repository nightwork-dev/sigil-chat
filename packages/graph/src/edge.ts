import type { EdgeId, SocketId } from "@workspace/graph/types"
import { createId } from "@workspace/graph/types"

export interface Edge {
  id: EdgeId
  from: SocketId
  to: SocketId
}

export function createEdge(from: SocketId, to: SocketId): Edge {
  return { id: createId() as EdgeId, from, to }
}
