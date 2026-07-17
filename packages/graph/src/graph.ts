import type { NodeId, EdgeId, SocketId } from "@workspace/graph/types";
import type { Node } from "@workspace/graph/node";
import type { Edge } from "@workspace/graph/edge";
import type { Socket } from "@workspace/graph/socket";
import { socketAcceptsKind } from "@workspace/graph/socket";

/**
 * Typed computation graph with topological execution.
 *
 * Nodes have input/output sockets. Edges connect output → input.
 * Type coercion is validated at connection time.
 * Topological sort determines execution order.
 */
export class Graph {
  nodes = new Map<NodeId, Node>();
  edges = new Map<EdgeId, Edge>();

  addNode(node: Node): void {
    this.nodes.set(node.id, node);
  }

  removeNode(nodeId: NodeId): void {
    // Remove connected edges
    const toRemove: EdgeId[] = [];
    for (const [edgeId, edge] of this.edges) {
      const from = this.getSocket(edge.from);
      const to = this.getSocket(edge.to);
      if (from?.nodeId === nodeId || to?.nodeId === nodeId) {
        toRemove.push(edgeId);
      }
    }
    toRemove.forEach((id) => this.removeEdge(id));
    this.nodes.delete(nodeId);
  }

  addEdge(edge: Edge): void {
    if (!this.canConnect(edge.from, edge.to)) {
      throw new Error("Invalid connection");
    }
    const from = this.getSocket(edge.from);
    const to = this.getSocket(edge.to);
    if (from && to) {
      from.connections.add(edge.to);
      to.connections.add(edge.from);
    }
    this.edges.set(edge.id, edge);
  }

  removeEdge(edgeId: EdgeId): void {
    const edge = this.edges.get(edgeId);
    if (!edge) return;
    const from = this.getSocket(edge.from);
    const to = this.getSocket(edge.to);
    if (from) from.connections.delete(edge.to);
    if (to) to.connections.delete(edge.from);
    this.edges.delete(edgeId);
  }

  /** Socket ID format: nodeId:direction:name */
  getSocket(socketId: SocketId): Socket | undefined {
    const [nodeId, direction, name] = socketId.split(":");
    const node = this.nodes.get(nodeId as NodeId);
    if (!node) return undefined;
    return (direction === "input" ? node.inputs : node.outputs).get(name);
  }

  canConnect(from: SocketId, to: SocketId): boolean {
    const fromSocket = this.getSocket(from);
    const toSocket = this.getSocket(to);
    if (!fromSocket || !toSocket) return false;
    if (fromSocket.nodeId === toSocket.nodeId) return false;
    if (fromSocket.direction !== "output" || toSocket.direction !== "input")
      return false;
    if (!toSocket.multiple && toSocket.connections.size > 0) return false;
    return socketAcceptsKind(toSocket, fromSocket.kind);
  }

  getDownstream(nodeId: NodeId): Set<NodeId> {
    const result = new Set<NodeId>();
    const node = this.nodes.get(nodeId);
    if (!node) return result;
    for (const [, socket] of node.outputs) {
      for (const connId of socket.connections) {
        const s = this.getSocket(connId);
        if (s) result.add(s.nodeId);
      }
    }
    return result;
  }

  getUpstream(nodeId: NodeId): Set<NodeId> {
    const result = new Set<NodeId>();
    const node = this.nodes.get(nodeId);
    if (!node) return result;
    for (const [, socket] of node.inputs) {
      for (const connId of socket.connections) {
        const s = this.getSocket(connId);
        if (s) result.add(s.nodeId);
      }
    }
    return result;
  }

  /** Topological sort — upstream nodes execute before downstream */
  topologicalSort(): NodeId[] {
    const sorted: NodeId[] = [];
    const visited = new Set<NodeId>();
    const visiting = new Set<NodeId>();

    const visit = (nodeId: NodeId) => {
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) throw new Error("Cycle detected in graph");
      visiting.add(nodeId);
      for (const upId of this.getUpstream(nodeId)) visit(upId);
      visiting.delete(nodeId);
      visited.add(nodeId);
      sorted.push(nodeId);
    };

    for (const nodeId of this.nodes.keys()) visit(nodeId);
    return sorted;
  }
}
