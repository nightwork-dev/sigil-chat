import type { SocketId, NodeId } from "@workspace/graph/types";
import {
  DataKind,
  canCoerce,
  coerce,
  inferKind,
  type DataValue,
} from "@workspace/graph/data-kinds";

export type SocketRole =
  | "value"
  | "control"
  | "condition"
  | "collection"
  | "context"
  | "trigger";

export interface SocketDefinition {
  name: string;
  label?: string;
  description?: string;
  role?: SocketRole;
  kind: DataKind;
  required?: boolean;
  multiple?: boolean;
  dynamic?: boolean;
  accepts?: DataKind[];
  defaultValue?: DataValue;
}

export interface Socket extends SocketDefinition {
  id: SocketId;
  nodeId: NodeId;
  direction: "input" | "output";
  connections: Set<SocketId>;
  value?: DataValue;
}

export function createSocket(
  nodeId: NodeId,
  definition: SocketDefinition,
  direction: "input" | "output",
): Socket {
  return {
    ...definition,
    id: `${nodeId}:${direction}:${definition.name}` as SocketId,
    nodeId,
    direction,
    connections: new Set(),
    value: definition.defaultValue,
  };
}

export function socketAcceptsKind(
  socket: SocketDefinition,
  sourceKind: DataKind,
): boolean {
  if (socket.accepts) return socket.accepts.includes(sourceKind);
  return canCoerce(sourceKind, socket.kind);
}

export function normalizeSocketValue(
  socket: SocketDefinition,
  value: DataValue,
  sourceKind = inferKind(value),
): DataValue {
  if (!socketAcceptsKind(socket, sourceKind)) {
    throw new Error(`Cannot connect ${sourceKind} to ${socket.kind}`);
  }
  if (
    sourceKind === socket.kind ||
    socket.kind === DataKind.Any ||
    socket.accepts?.includes(sourceKind)
  ) {
    return value;
  }
  return coerce(value, sourceKind, socket.kind);
}
