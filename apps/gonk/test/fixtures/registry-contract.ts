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
    name: "sigil-story-list",
    description:
      "List the current roadmap stories with their status, routing, dependencies, and review state.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: ["filter", "expectedRevision"],
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
    name: "sigil-story-inspect",
    description:
      "Inspect one roadmap story by stable id, including its comments and review items.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: ["id"],
      properties: ["id", "expectedRevision"],
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
    name: "sigil-story-upsert",
    description:
      "Create or replace a roadmap story. Inspect the existing story first when updating one, and pass its revision to avoid overwriting newer work.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["story"],
      properties: ["story", "expectedRevision"],
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
    name: "sigil-story-transition",
    description:
      "Change one roadmap story's status. Inspect the story first and use its current revision when available.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["id", "status"],
      properties: ["id", "status", "expectedRevision"],
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
    name: "sigil-story-assign-review",
    description:
      "Assign the installation owner a pending review for one roadmap story. The new review item starts unread and incomplete until the owner decides it.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["id", "gate"],
      properties: ["id", "gate", "title", "summary", "expectedRevision"],
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
    name: "sigil-story-comment",
    description:
      "Add a comment to one roadmap story's thread — respond to the owner's in-app feedback, ask a question, or flag a concern. Inspect the story first to read existing feedback (and use its revision). Set `addressee` to direct the note at a teammate (coordinator / strategist / analysis) or omit it for a general comment.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["storyId", "kind", "author", "body"],
      properties: [
        "storyId",
        "kind",
        "author",
        "body",
        "addressee",
        "parentCommentId",
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
    name: "sigil-feature-request-propose",
    description:
      "Propose a durable product feature request from the current trusted principal and scope. Use only for durable product changes, defects, or capability requests; it creates idea-stage feature requests and blocks likely duplicates.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["title", "problem", "desiredOutcome"],
      properties: [
        "title",
        "problem",
        "desiredOutcome",
        "evidence",
        "sourceRefs",
        "intendedScopeId",
        "proposedSponsorPrincipalId",
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
    name: "sigil-spec-list",
    description:
      "List durable product specifications in the roadmap, optionally filtered by lifecycle status or linked story id.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: ["filter", "expectedRevision"],
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
    name: "sigil-spec-inspect",
    description:
      "Inspect one durable product specification by stable id, including its Markdown body and linked roadmap stories.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: ["id"],
      properties: ["id", "expectedRevision"],
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
    name: "sigil-spec-create",
    description:
      "Create a new durable product specification in draft status. This never updates an existing id; inspect or list first to avoid duplicates.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["id", "title", "summary", "body"],
      properties: [
        "id",
        "title",
        "summary",
        "body",
        "storyIds",
        "supersedes",
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
    name: "sigil-spec-revise",
    description:
      "Revise an existing durable specification without changing its lifecycle status. Inspect first and pass the current revision to avoid overwriting newer work.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["id"],
      properties: [
        "id",
        "title",
        "summary",
        "body",
        "storyIds",
        "supersedes",
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
    name: "sigil-spec-transition",
    description:
      "Change a durable specification's lifecycle status. Inspect it first and pass the current revision when available.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["id", "status"],
      properties: ["id", "status", "expectedRevision"],
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
    name: "sigil-project-list",
    description:
      "List durable project summaries for projects where the authenticated principal is a current member.",
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
    name: "sigil-project-inspect",
    description:
      "Inspect one durable project, including its members and settings.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: ["id"],
      properties: ["id"],
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
    name: "sigil-project-upsert",
    description:
      "Create a durable project for the authenticated principal, or update an existing project as one of its current owners. Updates require expectedRevision.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["project"],
      properties: ["project", "expectedRevision"],
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
    name: "sigil-workspace-list",
    description:
      "List focused workspaces, optionally only those contained by one project.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: ["projectId"],
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
    name: "sigil-workspace-inspect",
    description: "Inspect one workspace and its containing project id.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: ["id"],
      properties: ["id"],
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
    name: "sigil-workspace-upsert",
    description:
      "Create or update a workspace inside a project where the authenticated principal is a current member. Updates require expectedRevision and cannot move the canonical project.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["workspace"],
      properties: ["workspace", "expectedRevision"],
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
    name: "sigil-annotate",
    description:
      "Leave a persistent note anchored to a specific attention item (a selected passage, focused element). The note renders as an overlay the user can expand, not just a transcript line. Use while reviewing or working on a specific subject.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["anchorId", "body"],
      properties: ["anchorId", "body"],
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
    name: "sigil-pin",
    description:
      "Pin a remark to a specific attention item — a persistent marker the user will notice on return, lighter-weight than a full note. Renders as an overlay anchor.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["anchorId", "body"],
      properties: ["anchorId", "body", "label"],
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
    name: "sigil-highlight",
    description:
      "Flag a specific attention item for the user's attention (e.g. a continuity issue, a turn to revisit). Renders as a primary-weighted overlay distinct from a quiet note.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["anchorId", "body"],
      properties: ["anchorId", "body", "label"],
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
    name: "sigil-skill-list",
    description:
      "List the managed skills visible at a scope, including their stable revisions and lifecycle metadata.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: ["scope", "includeFreshness"],
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
    name: "sigil-skill-get",
    description:
      "Inspect one managed skill by id, including its markdown body and supporting files.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: ["id"],
      properties: ["id", "scope", "includeFreshness"],
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
    name: "sigil-skill-upsert",
    description:
      "Create a managed skill or replace the markdown body of an existing skill. Inspect first and pass its revision when updating to avoid overwriting newer work.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["id", "scope", "body"],
      properties: [
        "id",
        "scope",
        "body",
        "description",
        "expectedRevision",
        "idempotencyKey",
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
    name: "sigil-skill-delete",
    description:
      "Archive a managed skill as the reversible delete operation. Inspect first and pass its current revision so stale deletes fail safely.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["id", "expectedRevision"],
      properties: ["id", "expectedRevision", "scope", "idempotencyKey"],
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
  {
    name: "sigil-generate-image",
    description:
      "Generate an image from a text prompt using the local Codex login (the same ChatGPT session the agent runs on — no separate API key). Returns the image inline in the chat. Use when the user asks to see an illustration, mockup, diagram sketch, or concept art.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["prompt"],
      properties: ["prompt", "width", "height"],
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
    name: "sigil-edit-image",
    description:
      "Edit an existing session image from a source artifact or inline image using a real instruction-edit backend. Returns a new session artifact and same-origin authenticated media URL with derivation provenance. Fails loudly if the edit backend is unavailable; it never substitutes text-to-image generation.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["instruction"],
      properties: [
        "instruction",
        "sourceArtifactId",
        "inlineImage",
        "width",
        "height",
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
    name: "sigil-resource-discover",
    description:
      "For a personal agent session, discover the current principal's readable project, workspace, and session resource scopes plus identity-deduplicated file metadata. Every scope is re-authorized live; use sigil-read-file with one returned scope to retrieve content.",
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
    name: "sigil-list-session-files",
    description:
      "List files attached to the request's session, workspace, project, or persona resource scope. Omit scope to use the request's session scope.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: [],
      properties: ["scope"],
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
    name: "sigil-read-file",
    description:
      "Read a file attached to the request's session, workspace, project, or persona resource scope by id. Omit scope to use the request's session scope; text is decoded with a bounded response and binary files return metadata.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: ["id"],
      properties: ["id", "scope"],
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
    name: "sigil-evidence-ask",
    description:
      "Find BM25-ranked passages in the current session, workspace, project, or persona artifacts for a question. Returns structured citations with exact quotes and text offsets; when no passage matches, returns no-evidence and explicitly forbids invented citations.",
    visibility: "always",
    approval: "read",
    schema: {
      type: "object",
      required: ["question"],
      properties: ["question", "limit", "scope"],
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
    name: "sigil-distill",
    description:
      "Persist a distilled structured artifact (question / summary / resolution / references) from a source document or thread. Read the source first (sigil-read-file, or the attachment), do the distillation yourself, then call this to store it as a session-scoped artifact the chat renders as a card and drops a pointer to on the blackboard. Set sourceArtifactId + sourceLabel when distilling an attached file so the card links back.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["title", "question", "summary", "resolution", "references"],
      properties: [
        "title",
        "question",
        "summary",
        "resolution",
        "references",
        "sourceArtifactId",
        "sourceLabel",
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
    name: "sigil-load-demo-doc",
    description:
      "Load the bundled Cerebras knowledge-base article into this session as an attachment, so it can be distilled (sigil-distill) or asked about with citations (sigil-evidence-ask). Call this when the user asks to load the demo document. Idempotent — the artifact is content-addressed, so re-loading returns the same one.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: [],
      properties: [],
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
    name: "sigil-blackboard-read",
    description: "Read the shared markdown blackboard for the current session.",
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
    name: "sigil-blackboard-write",
    description:
      "Replace the shared markdown blackboard for the current session after reading it. Pass the read result's revision as expectedRevision; use an empty content string to clear it.",
    visibility: "always",
    approval: "write",
    schema: {
      type: "object",
      required: ["content", "expectedRevision"],
      properties: ["content", "expectedRevision"],
      additionalProperties: false,
    },
    mcpAnnotations: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      openWorld: false,
    },
  },
];
