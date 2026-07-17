import { inferKind, type DataValue } from "@workspace/graph/data-kinds";
import { createEdge } from "@workspace/graph/edge";
import { ExecutionEngine } from "@workspace/graph/execution";
import { Graph } from "@workspace/graph/graph";
import { createNodeWithId } from "@workspace/graph/node";
import type { ReducerRegistry } from "@workspace/graph/reducer";
import {
  normalizeSocketValue,
  socketAcceptsKind,
} from "@workspace/graph/socket";
import type {
  EdgeId,
  NodeId,
  Position,
  SocketId,
  Viewport,
} from "@workspace/graph/types";

export type GraphValue =
  | string
  | number
  | boolean
  | null
  | GraphValue[]
  | { [key: string]: GraphValue };

export interface ReducerNodeDocument {
  id: string;
  reducerId: string;
  label: string;
  position: Position;
  inputValues: Record<string, GraphValue>;
}

export interface ReducerEdgeDocument {
  id: string;
  sourceNodeId: string;
  sourceSocket: string;
  targetNodeId: string;
  targetSocket: string;
  order?: number;
}

export interface ReducerGraphDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  revision: number;
  nodes: ReducerNodeDocument[];
  edges: ReducerEdgeDocument[];
  viewport?: Viewport;
}

export type ReducerGraphSelection =
  | { kind: "graph"; id: string }
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string };

export type ReducerGraphCommand =
  | { type: "node.add"; node: ReducerNodeDocument }
  | {
      type: "node.update";
      id: string;
      patch: Partial<Pick<ReducerNodeDocument, "label" | "inputValues">>;
    }
  | { type: "node.move"; id: string; position: Position }
  | { type: "node.remove"; id: string }
  | { type: "edge.add"; edge: ReducerEdgeDocument }
  | { type: "edge.remove"; id: string }
  | { type: "viewport.update"; viewport: Viewport };

export interface ReducerGraphRun {
  outputs: Record<string, Record<string, GraphValue>>;
  errors: Record<string, string>;
}

export interface ReducerGraphDiff {
  fromRevision: number;
  toRevision: number;
  nodes: { added: string[]; updated: string[]; removed: string[] };
  edges: { added: string[]; updated: string[]; removed: string[] };
}

export interface ReducerGraphValidationIssue {
  code:
    | "command"
    | "duplicate-id"
    | "invalid-id"
    | "unknown-reducer"
    | "unknown-socket"
    | "type-mismatch"
    | "invalid-connection"
    | "cycle"
    | "execution";
  message: string;
  resourceId?: string;
}

export interface ReducerGraphPlan {
  expectedRevision: number;
  proposedRevision: number;
  valid: boolean;
  commands: ReducerGraphCommand[];
  diff?: ReducerGraphDiff;
  issues: ReducerGraphValidationIssue[];
  document?: ReducerGraphDocument;
  run?: ReducerGraphRun;
}

export function graphCommandAffectsComputation(
  command: ReducerGraphCommand,
): boolean {
  switch (command.type) {
    case "node.move":
    case "viewport.update":
      return false;
    case "node.update":
      return command.patch.inputValues !== undefined;
    default:
      return true;
  }
}

export function graphComputationKey(document: ReducerGraphDocument): string {
  return JSON.stringify({
    schemaVersion: document.schemaVersion,
    nodes: document.nodes.map(({ id, inputValues, reducerId }) => ({
      id,
      reducerId,
      inputValues: canonicalizeGraphValue(inputValues),
    })),
    edges: orderedEdges(document.edges).map(
      ({ order, sourceNodeId, sourceSocket, targetNodeId, targetSocket }) => ({
        sourceNodeId,
        sourceSocket,
        targetNodeId,
        targetSocket,
        ...(order === undefined ? {} : { order }),
      }),
    ),
  });
}

const cloneDocument = (
  document: ReducerGraphDocument,
): ReducerGraphDocument => ({
  ...document,
  nodes: document.nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    inputValues: { ...node.inputValues },
  })),
  edges: document.edges.map((edge) => ({ ...edge })),
  viewport: document.viewport ? { ...document.viewport } : undefined,
});

export function reduceGraphDocument(
  document: ReducerGraphDocument,
  command: ReducerGraphCommand,
): ReducerGraphDocument {
  const next = cloneDocument(document);

  switch (command.type) {
    case "node.add":
      assertValidNodeId(command.node.id);
      if (next.nodes.some((node) => node.id === command.node.id))
        throw new Error(`Node "${command.node.id}" already exists.`);
      next.nodes.push(command.node);
      break;
    case "node.update": {
      assertValidNodeId(command.id);
      const node = next.nodes.find((candidate) => candidate.id === command.id);
      if (!node) throw new Error(`Node "${command.id}" does not exist.`);
      if (command.patch.label !== undefined) node.label = command.patch.label;
      if (command.patch.inputValues !== undefined) {
        node.inputValues = {
          ...node.inputValues,
          ...command.patch.inputValues,
        };
      }
      break;
    }
    case "node.move": {
      assertValidNodeId(command.id);
      const node = next.nodes.find((candidate) => candidate.id === command.id);
      if (!node) throw new Error(`Node "${command.id}" does not exist.`);
      node.position = command.position;
      break;
    }
    case "node.remove":
      assertValidNodeId(command.id);
      next.nodes = next.nodes.filter((node) => node.id !== command.id);
      next.edges = next.edges.filter(
        (edge) =>
          edge.sourceNodeId !== command.id && edge.targetNodeId !== command.id,
      );
      break;
    case "edge.add":
      if (next.edges.some((edge) => edge.id === command.edge.id))
        throw new Error(`Edge "${command.edge.id}" already exists.`);
      next.edges.push(command.edge);
      break;
    case "edge.remove":
      next.edges = next.edges.filter((edge) => edge.id !== command.id);
      break;
    case "viewport.update":
      next.viewport = command.viewport;
      break;
    default:
      throw new Error(
        `Unknown graph command "${String((command as { type?: unknown }).type)}".`,
      );
  }

  next.revision += 1;
  return next;
}

export function reduceGraphCommands(
  document: ReducerGraphDocument,
  commands: ReducerGraphCommand[],
): ReducerGraphDocument {
  if (commands.length === 0) return cloneDocument(document);
  const next = commands.reduce(reduceGraphDocument, document);
  return { ...next, revision: document.revision + 1 };
}

export async function planGraphCommands(
  document: ReducerGraphDocument,
  commands: ReducerGraphCommand[],
  registry: ReducerRegistry,
): Promise<ReducerGraphPlan> {
  const base = {
    expectedRevision: document.revision,
    proposedRevision:
      commands.length === 0 ? document.revision : document.revision + 1,
    commands,
  };
  let proposed: ReducerGraphDocument;

  try {
    proposed = reduceGraphCommands(document, commands);
  } catch (error) {
    return {
      ...base,
      valid: false,
      issues: [{ code: "command", message: errorMessage(error) }],
    };
  }

  const affectsComputation = commands.some(graphCommandAffectsComputation);
  const issues = affectsComputation
    ? validateGraphDocument(proposed, registry)
    : [];
  let run: ReducerGraphRun | undefined;
  if (affectsComputation && issues.length === 0) {
    try {
      // Materialize and topo-sort here solely to classify cycles with issue code
      // "cycle"; runGraphDocument materializes again and would otherwise report "execution".
      const graph = materializeGraph(proposed, registry);
      graph.topologicalSort();
      run = await runGraphDocument(proposed, registry);
      Object.entries(run.errors).forEach(([resourceId, message]) => {
        issues.push({ code: "execution", message, resourceId });
      });
    } catch (error) {
      const message = errorMessage(error);
      issues.push({
        code: message.toLowerCase().includes("cycle")
          ? "cycle"
          : "invalid-connection",
        message,
      });
    }
  }

  return {
    ...base,
    valid: issues.length === 0,
    diff: diffGraphDocuments(document, proposed),
    issues,
    document: proposed,
    ...(run ? { run } : {}),
  };
}

export function validateGraphDocument(
  document: ReducerGraphDocument,
  registry: ReducerRegistry,
): ReducerGraphValidationIssue[] {
  const issues: ReducerGraphValidationIssue[] = [];
  collectDuplicateIds(document.nodes.map(({ id }) => id)).forEach((id) => {
    issues.push({
      code: "duplicate-id",
      message: `Node "${id}" is duplicated.`,
      resourceId: id,
    });
  });
  collectDuplicateIds(document.edges.map(({ id }) => id)).forEach((id) => {
    issues.push({
      code: "duplicate-id",
      message: `Edge "${id}" is duplicated.`,
      resourceId: id,
    });
  });
  document.nodes
    .filter(({ id }) => id.includes(":"))
    .forEach(({ id }) => {
      issues.push({
        code: "invalid-id",
        message: `Node id "${id}" cannot contain ":".`,
        resourceId: id,
      });
    });

  const reducers = new Map(
    document.nodes.map((node) => [node.id, registry.get(node.reducerId)]),
  );
  for (const node of document.nodes) {
    const reducer = reducers.get(node.id);
    if (!reducer) {
      issues.push({
        code: "unknown-reducer",
        message: `Reducer "${node.reducerId}" is not registered.`,
        resourceId: node.id,
      });
      continue;
    }
    for (const [inputName, value] of Object.entries(node.inputValues)) {
      const input = reducer.inputs.find(({ name }) => name === inputName);
      if (!input) {
        issues.push({
          code: "unknown-socket",
          message: `Input "${node.id}.${inputName}" does not exist.`,
          resourceId: node.id,
        });
        continue;
      }
      const kind = inferKind(value);
      if (!socketAcceptsKind(input, kind)) {
        issues.push({
          code: "type-mismatch",
          message: `Input "${node.id}.${inputName}" cannot accept ${kind}; expected ${input.kind}.`,
          resourceId: node.id,
        });
      }
    }
  }

  const occupiedInputs = new Set<string>();
  for (const edge of document.edges) {
    if (
      edge.sourceSocket.includes(":") ||
      edge.targetSocket.includes(":")
    ) {
      issues.push({
        code: "invalid-id",
        message: invalidSocketNameMessage(edge.id),
        resourceId: edge.id,
      });
      continue;
    }
    const sourceReducer = reducers.get(edge.sourceNodeId);
    const targetReducer = reducers.get(edge.targetNodeId);
    const source = sourceReducer?.outputs.find(
      ({ name }) => name === edge.sourceSocket,
    );
    const target = targetReducer?.inputs.find(
      ({ name }) => name === edge.targetSocket,
    );
    if (!source || !target) {
      issues.push({
        code: "unknown-socket",
        message: `Edge "${edge.id}" references a missing node or socket.`,
        resourceId: edge.id,
      });
      continue;
    }
    if (!socketAcceptsKind(target, source.kind)) {
      issues.push({
        code: "type-mismatch",
        message: `Edge "${edge.id}" cannot connect ${source.kind} to ${target.kind}.`,
        resourceId: edge.id,
      });
    }
    const targetId = `${edge.targetNodeId}.${edge.targetSocket}`;
    if (!target.multiple && occupiedInputs.has(targetId)) {
      issues.push({
        code: "invalid-connection",
        message: `Input "${targetId}" already has a connection.`,
        resourceId: edge.id,
      });
    }
    occupiedInputs.add(targetId);
  }

  return issues;
}

export function diffGraphDocuments(
  before: ReducerGraphDocument,
  after: ReducerGraphDocument,
): ReducerGraphDiff {
  return {
    fromRevision: before.revision,
    toRevision: after.revision,
    nodes: diffResources(before.nodes, after.nodes),
    edges: diffResources(before.edges, after.edges),
  };
}

export function materializeGraph(
  document: ReducerGraphDocument,
  registry: ReducerRegistry,
): Graph {
  const graph = new Graph();

  document.nodes.forEach((nodeDocument) => {
    assertValidNodeId(nodeDocument.id);
    const reducer = registry.get(nodeDocument.reducerId);
    if (!reducer)
      throw new Error(`Reducer "${nodeDocument.reducerId}" is not registered.`);
    const node = createNodeWithId(
      nodeDocument.id as NodeId,
      reducer,
      nodeDocument.position,
    );
    node.label = nodeDocument.label;
    Object.entries(nodeDocument.inputValues).forEach(([name, value]) => {
      const socket = node.inputs.get(name);
      if (socket) {
        try {
          socket.defaultValue = normalizeSocketValue(socket, value);
        } catch (error) {
          throw new Error(
            `Input "${nodeDocument.id}.${name}" cannot be coerced: ${errorMessage(error)}`,
          );
        }
      }
    });
    graph.addNode(node);
  });

  orderedEdges(document.edges).forEach((edgeDocument) => {
    assertValidSocketName(edgeDocument.id, edgeDocument.sourceSocket);
    assertValidSocketName(edgeDocument.id, edgeDocument.targetSocket);
    const edge = createEdge(
      `${edgeDocument.sourceNodeId}:output:${edgeDocument.sourceSocket}` as SocketId,
      `${edgeDocument.targetNodeId}:input:${edgeDocument.targetSocket}` as SocketId,
    );
    edge.id = edgeDocument.id as EdgeId;
    graph.addEdge(edge);
  });

  return graph;
}

function orderedEdges(edges: ReducerEdgeDocument[]): ReducerEdgeDocument[] {
  return edges
    .map((edge, index) => ({ edge, index }))
    .sort(
      (a, b) =>
        (a.edge.order ?? a.index) - (b.edge.order ?? b.index) ||
        a.index - b.index,
    )
    .map(({ edge }) => edge);
}

function canonicalizeGraphValue(value: GraphValue): GraphValue {
  if (Array.isArray(value)) return value.map(canonicalizeGraphValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalizeGraphValue(item)]),
    );
  }
  return value;
}

export async function runGraphDocument(
  document: ReducerGraphDocument,
  registry: ReducerRegistry,
): Promise<ReducerGraphRun> {
  const graph = materializeGraph(document, registry);
  const engine = new ExecutionEngine(graph);
  engine.markDirty([...graph.nodes.keys()]);
  const errors: Record<string, string> = {};

  try {
    await engine.execute();
  } catch (error) {
    for (const [id, node] of graph.nodes) {
      if (node.error) errors[id] = node.error.message;
    }
    if (Object.keys(errors).length === 0)
      errors.graph = error instanceof Error ? error.message : String(error);
  }

  const outputs: Record<string, Record<string, GraphValue>> = {};
  for (const [id, node] of graph.nodes) {
    outputs[id] = Object.fromEntries(
      [...node.outputs].map(([name, socket]) => [
        name,
        toGraphValue(socket.value),
      ]),
    );
  }

  return { outputs, errors };
}

function toGraphValue(value: DataValue | undefined): GraphValue {
  if (value === undefined || value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (Array.isArray(value)) return value.map((item) => toGraphValue(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toGraphValue(item)]),
    );
  }
  return String(value);
}

function collectDuplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return [...duplicates];
}

function diffResources<T extends { id: string }>(
  before: T[],
  after: T[],
): { added: string[]; updated: string[]; removed: string[] } {
  const beforeById = new Map(before.map((resource) => [resource.id, resource]));
  const afterById = new Map(after.map((resource) => [resource.id, resource]));
  return {
    added: after.filter(({ id }) => !beforeById.has(id)).map(({ id }) => id),
    updated: after
      .filter((resource) => {
        const previous = beforeById.get(resource.id);
        return (
          previous !== undefined &&
          JSON.stringify(previous) !== JSON.stringify(resource)
        );
      })
      .map(({ id }) => id),
    removed: before.filter(({ id }) => !afterById.has(id)).map(({ id }) => id),
  };
}

function assertValidNodeId(id: string): void {
  if (id.includes(":")) {
    throw new Error(`Invalid node id "${id}": node ids cannot contain ":".`);
  }
}

function assertValidSocketName(edgeId: string, socketName: string): void {
  if (socketName.includes(":")) {
    throw new Error(invalidSocketNameMessage(edgeId));
  }
}

function invalidSocketNameMessage(edgeId: string): string {
  return `Invalid edge "${edgeId}": socket names cannot contain ":".`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
