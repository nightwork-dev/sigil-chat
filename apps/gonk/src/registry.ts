import {
  ToolRegistry,
  shape,
  type ApprovalProvider,
} from "@gonk/tool-registry";
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
import {
  graphRepository,
  type GraphRepository,
} from "@workspace/graph-store/repository";
import {
  MemoryReviewRepository,
  reviewRepository,
  type ReviewRepository,
} from "@workspace/review-store";
import type {
  ReviewAnnotationKind,
  ReviewPassageEdit,
} from "@workspace/review-store/types";

interface UpdateNodeInput {
  id: string;
  label?: string;
  inputValues?: Record<string, GraphValue>;
  expectedRevision?: number;
}

interface AddNodeInput {
  reducerId: string;
  id?: string;
  label?: string;
  position?: { x: number; y: number };
  inputValues?: Record<string, GraphValue>;
  expectedRevision?: number;
}

interface ConnectInput {
  id?: string;
  sourceNodeId: string;
  sourceSocket: string;
  targetNodeId: string;
  targetSocket: string;
  order?: number;
  expectedRevision?: number;
}

interface RemoveInput {
  id: string;
  kind: "node" | "edge";
  expectedRevision?: number;
}

interface RevisionInput {
  expectedRevision?: number;
}

interface ReducerCatalogInput {
  query?: string;
  reducerId?: string;
}

interface BatchInput {
  commands: ReducerGraphCommand[];
  expectedRevision?: number;
}

type GraphEditAction =
  | ({ type: "add-node" } & Omit<AddNodeInput, "expectedRevision">)
  | ({ type: "update-node" } & Omit<UpdateNodeInput, "expectedRevision">)
  | {
      type: "move-node";
      id: string;
      position: { x: number; y: number };
    }
  | { type: "remove-node"; id: string }
  | ({ type: "connect" } & Omit<ConnectInput, "expectedRevision">)
  | { type: "remove-edge"; id: string };

interface GraphEditInput {
  actions: GraphEditAction[];
  expectedRevision?: number;
}

type HighlightEffect = "focus" | "pulse" | "dim-others" | "trace";

interface ReviewPassagesInput {
  ids: string[];
  before?: number;
  after?: number;
}

interface ReviewItemsInput {
  ids?: string[];
  passageIds?: string[];
  status?: "open" | "resolved" | "locked";
}

interface AddReviewAnnotationsInput {
  annotations: Array<{
    id?: string;
    passageIds: string[];
    kind: ReviewAnnotationKind;
    body: string;
    author?: string;
  }>;
}

interface UpdateReviewPassagesInput {
  passages: ReviewPassageEdit[];
  expectedRevision?: number;
}

interface UiHighlightInput {
  actions: Array<{
    targetIds: string[];
    effect: HighlightEffect;
  }>;
  clearPrevious?: boolean;
}

const readHints = {
  mcp: {
    annotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
} as const;

const writeHints = {
  mcp: {
    annotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
} as const;

export function createSigilRegistry(
  repository: GraphRepository = graphRepository,
  reviews: ReviewRepository = reviewRepository,
): ToolRegistry {
  const registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  });

  registry.register({
    name: "sigil-chat-status",
    description:
      "Report the live Sigil Chat runtime architecture and server time.",
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
        application: "sigil-chat",
        agentRuntime: "eve",
        toolRegistry: "gonk",
        graphModel: "typed-reducer-graph",
        transport: "mcp-streamable-http",
        serverTime: new Date().toISOString(),
      },
    }),
  });

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
      const reducers = input.reducerId
        ? [reducerRegistry.get(input.reducerId)].filter(
            (reducer): reducer is Reducer => reducer !== undefined,
          )
        : input.query
          ? reducerRegistry.search(input.query)
          : reducerRegistry.all();
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
      const patch = {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.inputValues !== undefined
          ? { inputValues: input.inputValues }
          : {}),
      };
      return {
        data: await repository.apply(
          { type: "node.update", id: input.id, patch },
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

  registry.register({
    name: "sigil-review-inspect",
    description:
      "Inspect the complete draft article review document, including its ordered outline, all passages, decisions, and annotations.",
    visibility: "always",
    approval: "read",
    input: shape<Record<string, never>>(
      isEmptyObject,
      "Expected an empty object.",
    ),
    inputJsonSchema: emptyObjectSchema(),
    hints: readHints,
    handler: async () => ({ data: await reviews.get() }),
  });

  registry.register({
    name: "sigil-review-passages",
    description:
      "Read one or more review passages by stable id, optionally including a bounded number of adjacent passages before and after each selection.",
    visibility: "always",
    approval: "read",
    input: shape<ReviewPassagesInput>(
      isReviewPassagesInput,
      "Expected a non-empty ids array and optional non-negative integer before and after counts.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: "string", minLength: 1 },
        },
        before: { type: "integer", minimum: 0, maximum: 10 },
        after: { type: "integer", minimum: 0, maximum: 10 },
      },
      required: ["ids"],
      additionalProperties: false,
    },
    hints: readHints,
    handler: async (input: ReviewPassagesInput) => {
      const document = await reviews.get();
      const indexes = input.ids.map((id) =>
        document.passages.findIndex((passage) => passage.id === id),
      );
      const missingIds = input.ids.filter((_, index) => indexes[index] === -1);
      if (missingIds.length > 0) {
        throw new Error(`Unknown passage ids: ${missingIds.join(", ")}.`);
      }
      const selectedIndexes = new Set<number>();
      for (const index of indexes) {
        for (
          let adjacentIndex = Math.max(0, index - (input.before ?? 0));
          adjacentIndex <=
          Math.min(document.passages.length - 1, index + (input.after ?? 0));
          adjacentIndex += 1
        ) {
          selectedIndexes.add(adjacentIndex);
        }
      }
      return {
        data: {
          documentId: document.id,
          revision: document.revision,
          requestedIds: input.ids,
          passages: [...selectedIndexes]
            .sort((left, right) => left - right)
            .map((index) => document.passages[index]),
        },
      };
    },
  });

  registry.register({
    name: "sigil-review-decisions",
    description:
      "List review decisions, optionally filtered by decision ids, selected passage ids, or status.",
    visibility: "always",
    approval: "read",
    input: shape<ReviewItemsInput>(
      isReviewDecisionItemsInput,
      "Expected optional ids, passageIds, and open or locked status filters.",
    ),
    inputJsonSchema: reviewItemsSchema(["open", "locked"]),
    hints: readHints,
    handler: async (input) => ({
      data: {
        decisions: filterReviewItems((await reviews.get()).decisions, input),
      },
    }),
  });

  registry.register({
    name: "sigil-review-annotations",
    description:
      "List review annotations with their full text, optionally filtered by annotation ids, selected passage ids, or status.",
    visibility: "always",
    approval: "read",
    input: shape<ReviewItemsInput>(
      isReviewAnnotationItemsInput,
      "Expected optional ids, passageIds, and open or resolved status filters.",
    ),
    inputJsonSchema: reviewItemsSchema(["open", "resolved"]),
    hints: readHints,
    handler: async (input) => ({
      data: {
        annotations: filterReviewItems(
          (await reviews.get()).annotations,
          input,
        ),
      },
    }),
  });

  registry.register({
    name: "sigil-review-update-passages",
    description:
      "Atomically replace the text of one or more review passages. Supply expectedBody when editing text previously inspected so stale edits fail instead of overwriting newer work.",
    visibility: "always",
    approval: "write",
    input: shape<UpdateReviewPassagesInput>(
      isUpdateReviewPassagesInput,
      "Expected a non-empty passages array with stable ids, body text, and optional expectedBody conflict guards.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        passages: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: objectSchema(
            {
              id: { type: "string", minLength: 1 },
              body: { type: "string" },
              expectedBody: { type: "string" },
            },
            ["id", "body"],
          ),
        },
        expectedRevision: { type: "integer", minimum: 0 },
      },
      required: ["passages"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input: UpdateReviewPassagesInput) => {
      const result = await reviews.updatePassages(
        input.passages,
        input.expectedRevision,
      );
      if (!result.applied) {
        return { data: result };
      }
      return {
        data: {
          applied: true,
          revision: result.document.revision,
          passages: result.passages,
          clientCommand: {
            type: "agent.domain.outcome",
            payload: {
              id: `review:passages.update:${result.document.revision}`,
              kind: "review.document.changed",
              resource: {
                kind: "review-document",
                id: result.document.id,
                revision: result.document.revision,
              },
              operation: "passages.update",
              changedIds: result.passages.map(({ id }) => id),
            },
          },
        },
      };
    },
  });

  registry.register({
    name: "sigil-review-add-annotation",
    description:
      "Attach one or more agent-authored annotations to one or more review passages in a single request.",
    visibility: "always",
    approval: "write",
    input: shape<AddReviewAnnotationsInput>(
      isAddReviewAnnotationsInput,
      "Expected a non-empty annotations array with passageIds, kind, and body.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        annotations: {
          type: "array",
          minItems: 1,
          items: objectSchema(
            {
              id: { type: "string", minLength: 1 },
              passageIds: {
                type: "array",
                minItems: 1,
                uniqueItems: true,
                items: { type: "string", minLength: 1 },
              },
              kind: {
                type: "string",
                enum: ["note", "flag", "question", "approval"],
              },
              body: { type: "string", minLength: 1 },
              author: { type: "string", minLength: 1 },
            },
            ["passageIds", "kind", "body"],
          ),
        },
      },
      required: ["annotations"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input: AddReviewAnnotationsInput) => {
      const result = await reviews.addAnnotations(
        input.annotations.map((annotation) => ({
          ...annotation,
          author: annotation.author ?? "agent",
        })),
      );
      return {
        data: {
          annotations: result.annotations,
          revision: result.document.revision,
          clientCommand: {
            type: "agent.domain.outcome",
            payload: {
              id: `review:annotations.add:${result.document.revision}:${result.annotations
                .map(({ id }) => id)
                .join(",")}`,
              kind: "review.document.changed",
              resource: {
                kind: "review-document",
                id: result.document.id,
                revision: result.document.revision,
              },
              operation: "annotations.add",
              changedIds: result.annotations.map(({ id }) => id),
            },
          },
        },
      };
    },
  });

  registry.register({
    name: "sigil-ui-highlight",
    description:
      "Return a structured client command that highlights stable application target ids. Targets are semantic ids, never CSS selectors.",
    visibility: "always",
    approval: "read",
    input: shape<UiHighlightInput>(
      isUiHighlightInput,
      "Expected a non-empty actions array with targetIds and a supported effect.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          minItems: 1,
          items: objectSchema(
            {
              targetIds: {
                type: "array",
                minItems: 1,
                uniqueItems: true,
                items: { type: "string", minLength: 1 },
              },
              effect: {
                type: "string",
                enum: ["focus", "pulse", "dim-others", "trace"],
              },
            },
            ["targetIds", "effect"],
          ),
        },
        clearPrevious: { type: "boolean" },
      },
      required: ["actions"],
      additionalProperties: false,
    },
    hints: readHints,
    handler: async (input) => ({
      data: {
        clientCommand: {
          type: "ui.highlight",
          payload: {
            clearPrevious: input.clearPrevious ?? true,
            actions: input.actions,
          },
        },
        command: {
          type: "ui.highlight",
          clearPrevious: input.clearPrevious ?? true,
          actions: input.actions,
        },
      },
    }),
  });

  return registry;
}

export const sigilApprovalProvider: ApprovalProvider = {
  decide: ({ approval }) =>
    approval.tier === "exec"
      ? {
          outcome: "denied",
          reason: "Sigil Chat does not permit executable MCP tools",
        }
      : {
          outcome: "approved",
          reason: `Sigil Chat permits ${approval.tier} application tools`,
        },
};

export function createReviewDemoRepository(options?: {
  now?: () => string;
}): ReviewRepository {
  return new MemoryReviewRepository({ now: options?.now });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || typeof value[key] === "string";
}

function isOptionalInteger(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || Number.isInteger(value[key]);
}

function isOptionalRecord(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || isRecord(value[key]);
}

function isEmptyObject(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

function isReducerCatalogInput(value: unknown): value is ReducerCatalogInput {
  if (!isRecord(value) || !hasOnlyKeys(value, ["query", "reducerId"]))
    return false;
  return (
    isOptionalString(value, "query") && isOptionalString(value, "reducerId")
  );
}

function isBatchInput(value: unknown): value is BatchInput {
  if (!isRecord(value) || !hasOnlyKeys(value, ["commands", "expectedRevision"]))
    return false;
  return (
    Array.isArray(value.commands) &&
    value.commands.length > 0 &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isGraphEditInput(value: unknown): value is GraphEditInput {
  if (!isRecord(value) || !hasOnlyKeys(value, ["actions", "expectedRevision"]))
    return false;
  return (
    Array.isArray(value.actions) &&
    value.actions.length > 0 &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isUpdateNodeInput(value: unknown): value is UpdateNodeInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "label", "inputValues", "expectedRevision"]) ||
    typeof value.id !== "string"
  )
    return false;
  return (
    isOptionalString(value, "label") &&
    isOptionalRecord(value, "inputValues") &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isPosition(value: unknown): value is { x: number; y: number } {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["x", "y"]) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y)
  );
}

function isAddNodeInput(value: unknown): value is AddNodeInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "reducerId",
      "id",
      "label",
      "position",
      "inputValues",
      "expectedRevision",
    ]) ||
    typeof value.reducerId !== "string"
  )
    return false;
  return (
    isOptionalString(value, "id") &&
    isOptionalString(value, "label") &&
    (value.position === undefined || isPosition(value.position)) &&
    isOptionalRecord(value, "inputValues") &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isConnectInput(value: unknown): value is ConnectInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "sourceNodeId",
      "sourceSocket",
      "targetNodeId",
      "targetSocket",
      "order",
      "expectedRevision",
    ]) ||
    typeof value.sourceNodeId !== "string" ||
    typeof value.sourceSocket !== "string" ||
    typeof value.targetNodeId !== "string" ||
    typeof value.targetSocket !== "string"
  )
    return false;
  return (
    isOptionalString(value, "id") &&
    isOptionalInteger(value, "order") &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isRemoveInput(value: unknown): value is RemoveInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "kind", "expectedRevision"]) ||
    typeof value.id !== "string" ||
    (value.kind !== "node" && value.kind !== "edge")
  )
    return false;
  return isOptionalInteger(value, "expectedRevision");
}

function isRevisionInput(value: unknown): value is RevisionInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["expectedRevision"]) &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isStringArray(value: unknown, allowEmpty = false): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => typeof item === "string" && item.length > 0)
  );
}

function isOptionalStringArray(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || isStringArray(value[key]);
}

function isBoundedOptionalCount(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return (
    value[key] === undefined ||
    (Number.isInteger(value[key]) &&
      (value[key] as number) >= 0 &&
      (value[key] as number) <= 10)
  );
}

function isReviewPassagesInput(value: unknown): value is ReviewPassagesInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["ids", "before", "after"]) &&
    isStringArray(value.ids) &&
    isBoundedOptionalCount(value, "before") &&
    isBoundedOptionalCount(value, "after")
  );
}

function isReviewItemsInput(
  value: unknown,
  statuses: readonly string[],
): value is ReviewItemsInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["ids", "passageIds", "status"]) &&
    isOptionalStringArray(value, "ids") &&
    isOptionalStringArray(value, "passageIds") &&
    (value.status === undefined ||
      (typeof value.status === "string" && statuses.includes(value.status)))
  );
}

function isReviewDecisionItemsInput(value: unknown): value is ReviewItemsInput {
  return isReviewItemsInput(value, ["open", "locked"]);
}

function isReviewAnnotationItemsInput(
  value: unknown,
): value is ReviewItemsInput {
  return isReviewItemsInput(value, ["open", "resolved"]);
}

function isReviewAnnotationKind(value: unknown): value is ReviewAnnotationKind {
  return (
    value === "note" ||
    value === "flag" ||
    value === "question" ||
    value === "approval"
  );
}

function isAddReviewAnnotationsInput(
  value: unknown,
): value is AddReviewAnnotationsInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["annotations"]) &&
    Array.isArray(value.annotations) &&
    value.annotations.length > 0 &&
    value.annotations.every(
      (annotation) =>
        isRecord(annotation) &&
        hasOnlyKeys(annotation, [
          "id",
          "passageIds",
          "kind",
          "body",
          "author",
        ]) &&
        isOptionalString(annotation, "id") &&
        isStringArray(annotation.passageIds) &&
        isReviewAnnotationKind(annotation.kind) &&
        typeof annotation.body === "string" &&
        annotation.body.trim().length > 0 &&
        isOptionalString(annotation, "author"),
    )
  );
}

function isUpdateReviewPassagesInput(
  value: unknown,
): value is UpdateReviewPassagesInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["passages", "expectedRevision"]) &&
    Array.isArray(value.passages) &&
    value.passages.length > 0 &&
    value.passages.every(
      (passage) =>
        isRecord(passage) &&
        hasOnlyKeys(passage, ["id", "body", "expectedBody"]) &&
        typeof passage.id === "string" &&
        passage.id.length > 0 &&
        typeof passage.body === "string" &&
        isOptionalString(passage, "expectedBody"),
    ) &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isHighlightEffect(value: unknown): value is HighlightEffect {
  return (
    value === "focus" ||
    value === "pulse" ||
    value === "dim-others" ||
    value === "trace"
  );
}

function isUiHighlightInput(value: unknown): value is UiHighlightInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["actions", "clearPrevious"]) &&
    Array.isArray(value.actions) &&
    value.actions.length > 0 &&
    (value.clearPrevious === undefined ||
      typeof value.clearPrevious === "boolean") &&
    value.actions.every(
      (action) =>
        isRecord(action) &&
        hasOnlyKeys(action, ["targetIds", "effect"]) &&
        isStringArray(action.targetIds) &&
        isHighlightEffect(action.effect),
    )
  );
}

function emptyObjectSchema(): Record<string, unknown> {
  return { type: "object", properties: {}, additionalProperties: false };
}

function reviewItemsSchema(statuses: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      ids: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", minLength: 1 },
      },
      passageIds: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", minLength: 1 },
      },
      status: { type: "string", enum: statuses },
    },
    additionalProperties: false,
  };
}

function batchInputSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      commands: {
        type: "array",
        minItems: 1,
        items: graphCommandSchema(),
      },
      expectedRevision: { type: "integer" },
    },
    required: ["commands"],
    additionalProperties: false,
  };
}

function graphEditInputSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      actions: {
        type: "array",
        minItems: 1,
        description:
          "Ordered actions committed together. Later actions may reference explicit ids created earlier in this array.",
        items: {
          oneOf: [
            objectSchema(
              {
                type: { const: "add-node" },
                reducerId: { type: "string" },
                id: { type: "string" },
                label: { type: "string" },
                position: positionSchema(),
                inputValues: graphValuesSchema(),
              },
              ["type", "reducerId"],
            ),
            objectSchema(
              {
                type: { const: "update-node" },
                id: { type: "string" },
                label: { type: "string" },
                inputValues: graphValuesSchema(),
              },
              ["type", "id"],
            ),
            objectSchema(
              {
                type: { const: "move-node" },
                id: { type: "string" },
                position: positionSchema(),
              },
              ["type", "id", "position"],
            ),
            objectSchema(
              { type: { const: "remove-node" }, id: { type: "string" } },
              ["type", "id"],
            ),
            objectSchema(
              {
                type: { const: "connect" },
                id: { type: "string" },
                sourceNodeId: { type: "string" },
                sourceSocket: { type: "string" },
                targetNodeId: { type: "string" },
                targetSocket: { type: "string" },
                order: { type: "integer" },
              },
              [
                "type",
                "sourceNodeId",
                "sourceSocket",
                "targetNodeId",
                "targetSocket",
              ],
            ),
            objectSchema(
              { type: { const: "remove-edge" }, id: { type: "string" } },
              ["type", "id"],
            ),
          ],
        },
      },
      expectedRevision: { type: "integer" },
    },
    required: ["actions"],
    additionalProperties: false,
  };
}

function graphCommandSchema(): Record<string, unknown> {
  return {
    oneOf: [
      objectSchema(
        {
          type: { const: "node.add" },
          node: objectSchema(
            {
              id: { type: "string" },
              reducerId: { type: "string" },
              label: { type: "string" },
              position: positionSchema(),
              inputValues: graphValuesSchema(),
            },
            ["id", "reducerId", "label", "position", "inputValues"],
          ),
        },
        ["type", "node"],
      ),
      objectSchema(
        {
          type: { const: "node.update" },
          id: { type: "string" },
          patch: objectSchema({
            label: { type: "string" },
            inputValues: graphValuesSchema(),
          }),
        },
        ["type", "id", "patch"],
      ),
      objectSchema(
        {
          type: { const: "node.move" },
          id: { type: "string" },
          position: positionSchema(),
        },
        ["type", "id", "position"],
      ),
      objectSchema({ type: { const: "node.remove" }, id: { type: "string" } }, [
        "type",
        "id",
      ]),
      objectSchema(
        {
          type: { const: "edge.add" },
          edge: objectSchema(
            {
              id: { type: "string" },
              sourceNodeId: { type: "string" },
              sourceSocket: { type: "string" },
              targetNodeId: { type: "string" },
              targetSocket: { type: "string" },
              order: { type: "integer" },
            },
            [
              "id",
              "sourceNodeId",
              "sourceSocket",
              "targetNodeId",
              "targetSocket",
            ],
          ),
        },
        ["type", "edge"],
      ),
      objectSchema({ type: { const: "edge.remove" }, id: { type: "string" } }, [
        "type",
        "id",
      ]),
      objectSchema(
        {
          type: { const: "viewport.update" },
          viewport: objectSchema(
            {
              x: { type: "number" },
              y: { type: "number" },
              zoom: { type: "number" },
            },
            ["x", "y", "zoom"],
          ),
        },
        ["type", "viewport"],
      ),
    ],
  };
}

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function positionSchema(): Record<string, unknown> {
  return objectSchema({ x: { type: "number" }, y: { type: "number" } }, [
    "x",
    "y",
  ]);
}

function graphValuesSchema(): Record<string, unknown> {
  return { type: "object", additionalProperties: true };
}

function filterReviewItems<
  T extends { id: string; passageIds: string[]; status: string },
>(items: T[], input: ReviewItemsInput): T[] {
  const ids = input.ids ? new Set(input.ids) : undefined;
  const passageIds = input.passageIds ? new Set(input.passageIds) : undefined;
  return items.filter(
    (item) =>
      (!ids || ids.has(item.id)) &&
      (!passageIds ||
        item.passageIds.some((passageId) => passageIds.has(passageId))) &&
      (input.status === undefined || item.status === input.status),
  );
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
          patch: {
            ...(action.label !== undefined ? { label: action.label } : {}),
            ...(action.inputValues !== undefined
              ? { inputValues: action.inputValues }
              : {}),
          },
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
