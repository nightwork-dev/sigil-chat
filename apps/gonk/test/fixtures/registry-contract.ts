export interface RegistryToolContract {
  name: string;
  description: string;
  visibility: "always" | "on-demand";
  approval: "read" | "write" | "exec";
  schema: {
    type: string;
    required: string[];
    properties: string[];
    additionalProperties: boolean;
  };
  mcpAnnotations: {
    readOnly: boolean;
    destructive: boolean;
    idempotent: boolean;
    openWorld: boolean;
  };
}

export const expectedRegistryToolContracts: RegistryToolContract[] = [
  {
    name: "sigil-chat-status",
    description:
      "Report the live Sigil Chat runtime architecture and server time.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: [],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
  {
    name: "sigil-reducer-catalog",
    description:
      "Search or inspect reducer schemas, including socket types, defaults, constraints, and examples. Use this before adding or rewiring nodes.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: ["query", "reducerId"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
  {
    name: "sigil-graph-inspect",
    description:
      "Inspect the current shared reducer graph, including nodes, typed edges, revision, and computed outputs.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: [],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
  {
    name: "sigil-graph-plan",
    description:
      "Dry-run a set of graph commands without mutation. Returns a proposed diff, computed outputs, and validation issues for sockets, types, cycles, values, and execution.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: ["commands"],
      properties: ["commands", "expectedRevision"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
  {
    name: "sigil-graph-apply-batch",
    description:
      "Apply several graph commands as one validated atomic revision. Nothing is written if any command, type check, cycle check, value validation, or execution check fails.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["commands"],
      properties: ["commands", "expectedRevision"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
  {
    name: "sigil-graph-edit",
    description:
      "Preferred graph mutation tool. Apply multiple related add, update, move, connect, and remove actions in one validated atomic transaction and one revision. Use explicit ids for added nodes that later actions in the same request need to reference. Nothing is written if any action fails.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["actions"],
      properties: ["actions", "expectedRevision"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
  {
    name: "sigil-graph-run",
    description:
      "Execute the current reducer graph and return every node output and validation error.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: [],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
  {
    name: "sigil-graph-update-node",
    description:
      "Update the label or editable input values of an existing reducer node. Use the selected node id from client context when available.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["id"],
      properties: ["id", "label", "inputValues", "expectedRevision"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
  {
    name: "sigil-graph-add-node",
    description:
      "Add a typed reducer node to the shared graph. Inspect the graph first to see available reducer ids and sockets.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["reducerId"],
      properties: [
        "reducerId",
        "id",
        "label",
        "position",
        "inputValues",
        "expectedRevision",
      ],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
  {
    name: "sigil-graph-connect",
    description:
      "Connect one reducer output socket to a compatible input socket in the shared graph.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: [
        "sourceNodeId",
        "sourceSocket",
        "targetNodeId",
        "targetSocket",
      ],
      properties: [
        "id",
        "sourceNodeId",
        "sourceSocket",
        "targetNodeId",
        "targetSocket",
        "order",
        "expectedRevision",
      ],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
  {
    name: "sigil-graph-remove",
    description:
      "Remove a reducer node or edge from the shared graph. Removing a node also removes its connected edges.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["id", "kind"],
      properties: ["id", "kind", "expectedRevision"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
  {
    name: "sigil-graph-undo",
    description: "Undo the most recent shared reducer graph mutation.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: [],
      properties: ["expectedRevision"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
  {
    name: "sigil-review-inspect",
    description:
      "Inspect the complete draft article review document, including its ordered outline, all passages, decisions, and annotations.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: [],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
  {
    name: "sigil-review-passages",
    description:
      "Read one or more review passages by stable id, optionally including a bounded number of adjacent passages before and after each selection.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: ["ids"],
      properties: ["ids", "before", "after"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
  {
    name: "sigil-review-decisions",
    description:
      "List review decisions, optionally filtered by decision ids, selected passage ids, or status.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: ["ids", "passageIds", "status"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
  {
    name: "sigil-review-annotations",
    description:
      "List review annotations with their full text, optionally filtered by annotation ids, selected passage ids, or status.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: ["ids", "passageIds", "status"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
  {
    name: "sigil-review-update-passages",
    description:
      "Atomically replace the text of one or more review passages. Supply expectedBody when editing text previously inspected so stale edits fail instead of overwriting newer work.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["passages"],
      properties: ["passages", "expectedRevision"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
  {
    name: "sigil-review-add-annotation",
    description:
      "Attach one or more agent-authored annotations to one or more review passages in a single request.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["annotations"],
      properties: ["annotations"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
  {
    name: "sigil-ui-highlight",
    description:
      "Return a structured client command that highlights stable application target ids. Targets are semantic ids, never CSS selectors.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: ["actions"],
      properties: ["actions", "clearPrevious"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
    },
  },
];
