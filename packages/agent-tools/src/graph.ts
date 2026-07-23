import { shape, type ToolRegistry } from "@gonk/tool-registry";
import {
  builtinReducers,
  createBuiltinReducerRegistry,
} from "@workspace/graph/builtins";
import type {
  GraphValue,
  ReducerGraphCommand,
  ReducerNodeDocument,
} from "@workspace/graph/document";
import type { Reducer } from "@workspace/graph/reducer";
import type { GraphRepository } from "@workspace/graph-store/repository";

import {
  batchInputSchema,
  emptyObjectSchema,
  graphEditInputSchema,
  readHints,
  writeHints,
} from "./domain-schemas.js";
import {
  type AddNodeInput,
  type BatchInput,
  type ConnectInput,
  type GraphEditAction,
  type GraphEditInput,
  type ReducerCatalogInput,
  type RemoveInput,
  type RevisionInput,
  type UpdateNodeInput,
  isAddNodeInput,
  isBatchInput,
  isConnectInput,
  isEmptyObject,
  isGraphEditInput,
  isReducerCatalogInput,
  isRemoveInput,
  isRevisionInput,
  isUpdateNodeInput,
} from "./validators.js";

export function registerGraphTools(
  registry: ToolRegistry,
  repository: GraphRepository,
): void {
  registry.register({
    name: "sigil-reducer-catalog",
    description:
      "Search or inspect reducer schemas, including socket types, defaults, constraints, and examples. Use this before adding or rewiring nodes.",
    visibility: "always",
    approval: "read",
    input: shape<ReducerCatalogInput>(
      isReducerCatalogInput,
      "Expected optional string query and reducerId fields.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search reducer id, name, or description.",
        },
        reducerId: {
          type: "string",
          description: "Return one exact reducer schema.",
        },
      },
      additionalProperties: false,
    },
    hints: readHints,
    handler: async (input) => {
      const reducerRegistry = createBuiltinReducerRegistry();
      const reducers = selectReducers(reducerRegistry, input);
      return { data: { reducers: reducers.map(describeReducer) } };
    },
  });

  registry.register({
    name: "sigil-graph-inspect",
    description:
      "Inspect the current shared reducer graph, including nodes, typed edges, revision, and computed outputs.",
    visibility: "always",
    approval: "read",
    input: shape<Record<string, never>>(
      isEmptyObject,
      "Expected an empty object.",
    ),
    inputJsonSchema: emptyObjectSchema(),
    hints: readHints,
    handler: async () => ({
      data: {
        document: await repository.get(),
        run: await repository.run(),
        reducers: builtinReducers.map(describeReducer),
      },
    }),
  });

  registry.register({
    name: "sigil-graph-plan",
    description:
      "Dry-run a set of graph commands without mutation. Returns a proposed diff, computed outputs, and validation issues for sockets, types, cycles, values, and execution.",
    visibility: "always",
    approval: "read",
    input: shape<BatchInput>(
      isBatchInput,
      "Expected a non-empty commands array and optional integer expectedRevision.",
    ),
    inputJsonSchema: batchInputSchema(),
    hints: readHints,
    handler: async (input) => ({
      data: await repository.plan(input.commands, input.expectedRevision),
    }),
  });

  registry.register({
    name: "sigil-graph-apply-batch",
    description:
      "Apply several graph commands as one validated atomic revision. Nothing is written if any command, type check, cycle check, value validation, or execution check fails.",
    visibility: "always",
    approval: "write",
    input: shape<BatchInput>(
      isBatchInput,
      "Expected a non-empty commands array and optional integer expectedRevision.",
    ),
    inputJsonSchema: batchInputSchema(),
    hints: writeHints,
    handler: async (input) => ({
      data: await repository.applyBatch(input.commands, input.expectedRevision),
    }),
  });

  registry.register({
    name: "sigil-graph-edit",
    description:
      "Preferred graph mutation tool. Apply multiple related add, update, move, connect, and remove actions in one validated atomic transaction and one revision. Use explicit ids for added nodes that later actions in the same request need to reference. Nothing is written if any action fails.",
    visibility: "always",
    approval: "write",
    input: shape<GraphEditInput>(
      isGraphEditInput,
      "Expected a non-empty actions array and optional integer expectedRevision.",
    ),
    inputJsonSchema: graphEditInputSchema(),
    hints: writeHints,
    handler: async (input) => {
      const document = await repository.get();
      const commands = compileGraphEditActions(input.actions, document);
      return {
        data: await repository.applyBatch(
          commands,
          input.expectedRevision ?? document.revision,
        ),
      };
    },
  });

  registry.register({
    name: "sigil-graph-run",
    description:
      "Execute the current reducer graph and return every node output and validation error.",
    visibility: "always",
    approval: "read",
    input: shape<Record<string, never>>(
      isEmptyObject,
      "Expected an empty object.",
    ),
    inputJsonSchema: emptyObjectSchema(),
    hints: readHints,
    handler: async () => ({ data: await repository.run() }),
  });

  registry.register({
    name: "sigil-graph-update-node",
    description:
      "Update the label or editable input values of an existing reducer node. Use the selected node id from client context when available.",
    visibility: "always",
    approval: "write",
    input: shape<UpdateNodeInput>(
      isUpdateNodeInput,
      "Expected an object with a string id and optional label or inputValues.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Stable reducer node id." },
        label: { type: "string" },
        inputValues: { type: "object", additionalProperties: true },
        expectedRevision: { type: "integer" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input) => {
      if (input.label === undefined && input.inputValues === undefined) {
        throw new Error("Provide label or inputValues.");
      }
      return {
        data: await repository.apply(
          {
            type: "node.update",
            id: input.id,
            patch: nodePatchFromInput(input),
          },
          input.expectedRevision,
        ),
      };
    },
  });

  registry.register({
    name: "sigil-graph-add-node",
    description:
      "Add a typed reducer node to the shared graph. Inspect the graph first to see available reducer ids and sockets.",
    visibility: "always",
    approval: "write",
    input: shape<AddNodeInput>(
      isAddNodeInput,
      "Expected an object with a string reducerId.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        reducerId: { type: "string" },
        id: { type: "string" },
        label: { type: "string" },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } },
          required: ["x", "y"],
          additionalProperties: false,
        },
        inputValues: { type: "object", additionalProperties: true },
        expectedRevision: { type: "integer" },
      },
      required: ["reducerId"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input) => {
      const reducer = createBuiltinReducerRegistry().get(input.reducerId);
      if (!reducer) throw new Error(`Unknown reducer "${input.reducerId}".`);
      const document = await repository.get();
      const node: ReducerNodeDocument = {
        id:
          input.id ??
          nextNodeId(
            input.reducerId,
            document.nodes.map(({ id }) => id),
          ),
        reducerId: reducer.id,
        label: input.label ?? reducer.name,
        position: input.position ?? {
          x: 160 + document.nodes.length * 32,
          y: 120 + document.nodes.length * 24,
        },
        inputValues: {
          ...Object.fromEntries(
            reducer.inputs
              .filter(({ defaultValue }) => defaultValue !== undefined)
              .map(({ name, defaultValue }) => [
                name,
                defaultValue as GraphValue,
              ]),
          ),
          ...input.inputValues,
        },
      };
      return {
        data: await repository.apply(
          { type: "node.add", node },
          input.expectedRevision ?? document.revision,
        ),
      };
    },
  });

  registry.register({
    name: "sigil-graph-connect",
    description:
      "Connect one reducer output socket to a compatible input socket in the shared graph.",
    visibility: "always",
    approval: "write",
    input: shape<ConnectInput>(
      isConnectInput,
      "Expected source and target node and socket strings.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        sourceNodeId: { type: "string" },
        sourceSocket: { type: "string" },
        targetNodeId: { type: "string" },
        targetSocket: { type: "string" },
        order: {
          type: "integer",
          description: "Stable order when connecting to a multi-input port.",
        },
        expectedRevision: { type: "integer" },
      },
      required: [
        "sourceNodeId",
        "sourceSocket",
        "targetNodeId",
        "targetSocket",
      ],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input) => {
      const id =
        input.id ??
        `${input.sourceNodeId}-${input.sourceSocket}-${input.targetNodeId}-${input.targetSocket}`;
      return {
        data: await repository.apply(
          {
            type: "edge.add",
            edge: {
              id,
              sourceNodeId: input.sourceNodeId,
              sourceSocket: input.sourceSocket,
              targetNodeId: input.targetNodeId,
              targetSocket: input.targetSocket,
              ...(input.order !== undefined ? { order: input.order } : {}),
            },
          },
          input.expectedRevision,
        ),
      };
    },
  });

  registry.register({
    name: "sigil-graph-remove",
    description:
      "Remove a reducer node or edge from the shared graph. Removing a node also removes its connected edges.",
    visibility: "always",
    approval: "write",
    input: shape<RemoveInput>(
      isRemoveInput,
      "Expected a string id and kind of node or edge.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        kind: { type: "string", enum: ["node", "edge"] },
        expectedRevision: { type: "integer" },
      },
      required: ["id", "kind"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input) => ({
      data: await repository.apply(
        input.kind === "node"
          ? { type: "node.remove", id: input.id }
          : { type: "edge.remove", id: input.id },
        input.expectedRevision,
      ),
    }),
  });

  registry.register({
    name: "sigil-graph-undo",
    description: "Undo the most recent shared reducer graph mutation.",
    visibility: "always",
    approval: "write",
    input: shape<RevisionInput>(
      isRevisionInput,
      "Expected an optional integer expectedRevision.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: { expectedRevision: { type: "integer" } },
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input) => ({
      data: await repository.undo(input.expectedRevision),
    }),
  });
}

function selectReducers(
  reducerRegistry: ReturnType<typeof createBuiltinReducerRegistry>,
  input: ReducerCatalogInput,
): Reducer[] {
  if (input.reducerId) {
    const reducer = reducerRegistry.get(input.reducerId);
    return reducer ? [reducer] : [];
  }
  if (input.query) return reducerRegistry.search(input.query);
  return reducerRegistry.all();
}

function nodePatchFromInput(
  input: Pick<UpdateNodeInput, "label" | "inputValues">,
): Partial<Pick<ReducerNodeDocument, "label" | "inputValues">> {
  const patch: Partial<Pick<ReducerNodeDocument, "label" | "inputValues">> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.inputValues !== undefined) patch.inputValues = input.inputValues;
  return patch;
}

function compileGraphEditActions(
  actions: GraphEditAction[],
  document: Awaited<ReturnType<GraphRepository["get"]>>,
): ReducerGraphCommand[] {
  const reducerRegistry = createBuiltinReducerRegistry();
  const reservedNodeIds = document.nodes.map(({ id }) => id);

  return actions.map((action) => {
    switch (action.type) {
      case "add-node": {
        const reducer = reducerRegistry.get(action.reducerId);
        if (!reducer) throw new Error(`Unknown reducer "${action.reducerId}".`);
        const id = action.id ?? nextNodeId(action.reducerId, reservedNodeIds);
        reservedNodeIds.push(id);
        return {
          type: "node.add",
          node: {
            id,
            reducerId: reducer.id,
            label: action.label ?? reducer.name,
            position: action.position ?? {
              x: 160 + reservedNodeIds.length * 32,
              y: 120 + reservedNodeIds.length * 24,
            },
            inputValues: {
              ...Object.fromEntries(
                reducer.inputs
                  .filter(({ defaultValue }) => defaultValue !== undefined)
                  .map(({ name, defaultValue }) => [name, defaultValue]),
              ),
              ...action.inputValues,
            } as Record<string, GraphValue>,
          },
        };
      }
      case "update-node":
        if (action.label === undefined && action.inputValues === undefined) {
          throw new Error(`Update for node "${action.id}" has no changes.`);
        }
        return {
          type: "node.update",
          id: action.id,
          patch: nodePatchFromInput(action),
        };
      case "move-node":
        return { type: "node.move", id: action.id, position: action.position };
      case "remove-node":
        return { type: "node.remove", id: action.id };
      case "connect":
        return {
          type: "edge.add",
          edge: {
            id:
              action.id ??
              `${action.sourceNodeId}-${action.sourceSocket}-${action.targetNodeId}-${action.targetSocket}`,
            sourceNodeId: action.sourceNodeId,
            sourceSocket: action.sourceSocket,
            targetNodeId: action.targetNodeId,
            targetSocket: action.targetSocket,
            ...(action.order !== undefined ? { order: action.order } : {}),
          },
        };
      case "remove-edge":
        return { type: "edge.remove", id: action.id };
      default:
        throw new Error(
          `Unknown graph edit action "${String((action as { type?: unknown }).type)}".`,
        );
    }
  });
}

function describeReducer(reducer: Reducer) {
  return {
    id: reducer.id,
    name: reducer.name,
    description: reducer.description,
    pure: reducer.pure ?? false,
    async: reducer.async ?? false,
    constraints: reducer.constraints ?? [],
    inputs: reducer.inputs.map(
      ({
        name,
        label,
        description,
        role,
        kind,
        defaultValue,
        required,
        multiple,
        accepts,
      }) => ({
        name,
        label: label ?? name,
        ...(description ? { description } : {}),
        role: role ?? "value",
        kind,
        ...(defaultValue !== undefined ? { defaultValue } : {}),
        required: required ?? false,
        multiple: multiple ?? false,
        ...(accepts ? { accepts } : {}),
      }),
    ),
    outputs: reducer.outputs.map(
      ({ name, label, description, role, kind, multiple }) => ({
        name,
        label: label ?? name,
        ...(description ? { description } : {}),
        role: role ?? "value",
        kind,
        multiple: multiple ?? false,
      }),
    ),
    examples: reducer.examples ?? [],
  };
}

function nextNodeId(reducerId: string, existingIds: string[]): string {
  const base = reducerId
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  let suffix = 1;
  while (existingIds.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
