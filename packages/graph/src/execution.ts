/**
 * Graph execution engine.
 *
 * Executes nodes in topological order with dirty tracking and caching.
 * When a node's inputs change, it and all downstream nodes are marked dirty.
 * Only dirty nodes execute. Results are cached.
 */

import type { NodeId } from "@workspace/graph/types";
import type { Node } from "@workspace/graph/node";
import { Graph } from "@workspace/graph/graph";
import { type DataValue } from "@workspace/graph/data-kinds";
import type { OutputValues, ExecutionContext } from "@workspace/graph/reducer";
import { normalizeSocketValue } from "@workspace/graph/socket";

interface CachedResult {
  outputs: OutputValues;
  timestamp: number;
}

export class ExecutionEngine {
  private cache = new Map<NodeId, CachedResult>();
  private dirty = new Set<NodeId>();

  constructor(private graph: Graph) {}

  /** Mark nodes as changed and propagate dirtiness downstream */
  markDirty(changed: NodeId[]): void {
    const queue = [...changed];
    while (queue.length > 0) {
      const nodeId = queue.pop()!;
      if (this.dirty.has(nodeId)) continue;
      this.dirty.add(nodeId);
      for (const downId of this.graph.getDownstream(nodeId)) {
        queue.push(downId);
      }
    }
  }

  /** Execute all dirty nodes in topological order */
  async execute(): Promise<void> {
    const sorted = this.graph.topologicalSort();
    const dirtySorted = sorted.filter((id) => this.dirty.has(id));

    for (const nodeId of dirtySorted) {
      const outputs = await this.executeNode(nodeId);
      this.cache.set(nodeId, { outputs, timestamp: Date.now() });
      this.dirty.delete(nodeId);
    }
  }

  /** Execute a single node, gathering inputs from upstream sockets */
  private async executeNode(nodeId: NodeId): Promise<OutputValues> {
    const node = this.graph.nodes.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);

    const inputs = this.gatherInputs(node);
    const ctx: ExecutionContext = {
      timestamp: Date.now(),
      executionId: `exec-${Date.now()}`,
    };

    try {
      if (node.reducer.validate) {
        const v = node.reducer.validate(inputs);
        if (!v.valid)
          throw new Error(`Validation failed: ${v.errors?.join(", ")}`);
      }

      const outputs = await node.reducer.run(inputs, ctx);

      // Update output socket values
      for (const [name, value] of Object.entries(outputs)) {
        const socket = node.outputs.get(name);
        if (socket) socket.value = value;
      }

      node.error = undefined;
      return outputs;
    } catch (error) {
      node.error = error as Error;
      throw error;
    }
  }

  private gatherInputs(node: Node): Record<string, DataValue> {
    const inputs: Record<string, DataValue> = {};

    for (const [name, socket] of node.inputs) {
      if (socket.connections.size === 0) {
        if (socket.defaultValue !== undefined) {
          inputs[name] = socket.defaultValue;
        } else if (socket.required) {
          throw new Error(`Required input ${name} is not connected`);
        }
        continue;
      }

      const connectedValues = Array.from(socket.connections).map(
        (connectedId) => {
          const connectedSocket = this.graph.getSocket(connectedId);
          if (!connectedSocket)
            throw new Error(`Socket ${connectedId} not found`);
          const value = connectedSocket.value;
          if (value === undefined)
            throw new Error(`Socket ${connectedId} has no value`);
          return normalizeSocketValue(socket, value, connectedSocket.kind);
        },
      );

      inputs[name] = socket.multiple
        ? connectedValues.flatMap((value) =>
            Array.isArray(value) ? value : [value],
          )
        : connectedValues[0];
    }

    return inputs;
  }

  getOutput(nodeId: NodeId, outputName: string): DataValue | undefined {
    const node = this.graph.nodes.get(nodeId);
    return node?.outputs.get(outputName)?.value;
  }

  clearCache(): void {
    this.cache.clear();
    this.dirty.clear();
  }
}
