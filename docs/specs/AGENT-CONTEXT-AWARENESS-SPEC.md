# Agent Context Awareness: Shared Attention

> Date: 2026-07-15
> Status: Draft product spec
> Scope: Sigil agentic workspaces, beginning with Sigil Chat

## 1. Goal

Make the agent a compact conversational layer over a real application toolset,
not the application itself. The user works directly in a workspace; an embedded
agent shares their attention and can operate the same domain objects through
Gonk-defined tools.

To do that, the agent needs the same immediate working context the user
reasonably expects a collaborator beside them to have: where they are, what they
selected, what they are editing, and which application object "this" refers to.

The product outcome is fewer turns spent restating visible context. A user
should be able to select an application object and ask "what is wrong with
this?" or "change this to match the others" without copying an identifier or
describing the current screen.

This is **shared attention**, not ambient surveillance. The application tells
the agent a small set of meaningful facts. The agent does not infer product
semantics by scraping the DOM or accumulating a behavioral trail.

The default product surface is an **agent HUD** over the workspace. Full-screen
chat remains a valid expanded, history, and debugging variant, but it is not the
primary interaction model.

## 2. Product Model

The product has three cooperating surfaces:

1. **Workspace** — the primary tool, editor, canvas, dashboard, or application
   surface where the user directly manipulates domain objects.
2. **Agent HUD** — a persistent, low-footprint overlay for asking, delegating,
   monitoring, approving, and inspecting context without leaving the work.
3. **Expanded conversation** — a larger transcript-oriented view for long
   reasoning, history, debugging, or tasks that temporarily need more room.

The HUD should expand only as the interaction demands:

- **At rest:** agent status and current context, without obscuring the tool.
- **Composing:** a compact prompt surface attached to the current selection.
- **Working:** streaming response and tool progress that can be collapsed while
  the workspace continues to update.
- **Approval required:** the requested action, target, and consequence become
  prominent enough for an informed decision.
- **Expanded:** the full conversation appears as a sidecar or dedicated route,
  preserving the same session and context history.

The HUD is not a decorative science-fiction layer. Every persistent element
must communicate current agent state, attached context, progress, or required
attention.

## 3. Reference Workspace: Computational Graph

The first real workspace should be a rebuilt computational graph editor. It is
small enough to finish and rich enough to prove the product:

- The user can create, select, configure, connect, run, and inspect typed nodes.
- Selection has precise domain meaning: graph, node, socket, edge, or execution.
- The agent can explain a graph, diagnose an invalid connection, add or replace
  nodes, repair edges, set inputs, run the graph, and interpret results.
- Every agent operation has an immediate visible consequence on the same canvas
  where the user is working.
- Graph edits naturally require mutation history, undo, validation, and
  approval, exercising the important product boundaries rather than a toy
  demonstration.

Sigil's existing typed graph engine, reducer registry, and canvas primitives are
the starting substrate. Oubliette is product archaeology: its useful lesson is
that entities and relationships become substantially more useful when they are
directly manipulable, but its React Flow, Jotai, tRPC, and Surreal wiring should
not be ported as an architecture.

V1 should use a conventional, legible node-and-port graph. Sigil's experimental
shape-to-computation semantics can remain a later interaction mode; making
geometry carry computational meaning in the first slice would obscure whether
the agent/workspace model itself is working.

## 4. Product Contract

Context awareness must be:

- **Application-authored.** Routes and components publish typed domain meaning,
  such as `project:123` or `field:title`, rather than arbitrary DOM attributes.
- **Sparse.** The current snapshot contains only what is useful for the next
  turn: location, active resource, focused control, and explicit transient
  state.
- **Inspectable.** The user can see what context will accompany a message and
  remove or replace it before sending.
- **Ephemeral.** Context follows the current surface and session. It expires
  when it is no longer true and is not an analytics or memory log.
- **Shared by model and tools.** Eve receives the same stable resource
  references that Gonk-backed tools resolve. "This" must not mean one thing to
  the model and another to a tool call.
- **Non-authorizing.** Awareness never grants permission to mutate an object.
  Normal Gonk authorization and Eve approval still apply.
- **Domain-operated.** The agent changes application state through the same
  domain operations that power the visible toolset, never through DOM clicking
  or private UI-only mutations.
- **Immediately legible.** Agent actions appear in the workspace itself. The
  user should see the affected object change, not merely receive a claim in the
  transcript.

## 5. V1 Context

The first version should describe four layers of attention:

1. **Location** — application, route, workspace, and visible surface.
2. **Selection** — the primary domain resource the user has deliberately
   selected, expressed as a stable typed reference.
3. **Focus** — the control, field, editor, or sub-resource currently receiving
   keyboard focus.
4. **State** — a small allowlisted set of facts the application explicitly
   declares, such as `dirty`, `readOnly`, or `hasValidationErrors`.

Resource references should prefer identity and labels over copied content:

```ts
type AgentResourceRef = {
  kind: string;
  id: string;
  label?: string;
};
```

Sensitive values, draft text, and large document bodies are excluded by
default. A component may deliberately attach content when the user-facing
feature requires it and the context inspector makes that inclusion visible.

## 6. User Experience

- Selecting an object updates the context attached to the next chat turn.
- Keyboard focus is treated as deliberately as pointer selection; hover alone
  does not establish agent context.
- The user can build an ordered multi-selection when the task spans several
  resources.
- The user chooses Minimal, Focused, or Expanded context privacy before a turn
  is sent.
- The composer exposes a compact, dynamic summary such as
  `Context: Project “Sigil Chat” · field “Title”`.
- Opening that summary reveals the exact structured snapshot and lets the user
  omit individual entries.
- The context used for a submitted turn is captured with that turn. Later UI
  movement must not silently rewrite the meaning of an earlier message.
- When context is absent or ambiguous, the agent asks rather than guessing.
- The workspace remains usable while the agent streams or runs tools.
- Agent mutations resolve into the same visible state and undo/history model as
  equivalent direct manipulation.
- Full-screen chat is reachable without starting a new agent session.

## 7. System Responsibilities

- **Sigil** owns the context vocabulary, explicit React annotations, current
  browser-side snapshot, HUD, expanded conversation, and user inspection
  controls.
- **Eve** captures the approved snapshot with the turn and presents it to the
  model as structured application context. It also owns the durable session,
  streaming lifecycle, interruption, and approval handoff shared by both chat
  variants.
- **Gonk** owns the schemas and tools that resolve stable resource references,
  validate inputs, authorize actions, and dispatch application operations.
- **React Query** owns context publication or synchronization across a network
  boundary and reconciles successful domain mutations back into the visible
  workspace. High-frequency local attention remains an external store so
  route, focus, and selection changes do not become server cache traffic.

This division is a product constraint, not a commitment to a specific transport
API. The implementation should use Eve's native per-turn or per-session
extension point if it preserves the contract above.

## 8. Non-Goals

- Scraping arbitrary `data-*` attributes or the accessibility tree.
- Recording raw clickstreams, pointer paths, keystrokes, or arbitrary DOM
  telemetry.
- Treating hover as a primary attention signal; only sustained, explicitly
  registered hover is eligible, and it is capped and discarded first.
- Persisting UI awareness as long-term agent memory.
- Streaming the entire page, DOM, or editor buffer on every interaction.
- Letting passive context trigger autonomous mutations.
- Replacing explicit attachments when the user wants the agent to inspect a
  complete file, image, or document.
- Treating chat as the only or primary product surface.
- Driving the toolset through simulated mouse and keyboard events when a domain
  operation can exist.
- Maintaining a second state model for agent-made changes outside the
  application's normal query, mutation, history, and undo paths.
- Rebuilding Oubliette's full entity platform before the agentic workspace
  interaction has been proven.

## 9. Acceptance Criteria

1. On a screen with two domain objects, selecting the second and asking "what
   am I looking at?" identifies the second without its name in the prompt.
2. Changing selection before the next turn changes the primary resource; prior
   focus/actions appear only when the selected privacy level permits the
   bounded semantic activity trail.
3. The context inspector exactly matches the snapshot captured with the turn.
4. A Gonk tool invoked from that turn resolves the same resource identifier the
   model saw and still follows its normal approval policy.
5. Mouse and keyboard users can establish and inspect equivalent context.
6. No context is derived from unregistered DOM nodes, and retained activity is
   bounded, semantic, privacy-controlled, and session-local.
7. Network failure does not corrupt local UI state; the send path reports that
   context could not be attached instead of silently sending misleading data.
8. A user can continue direct work while the agent streams, collapse the HUD,
   and later reopen the same session in the expanded conversation view.
9. A successful agent mutation is reflected in the underlying workspace through
   the same data path as the equivalent direct user action.
10. In the graph reference workspace, the user can select a node and ask the
    agent to explain, modify, or connect "this node" without naming its ID.
11. The resulting graph remains valid, undoable, and directly editable after an
    agent operation.
12. The workspace keeps the canvas as the dominant surface at narrow and medium
    widths; inspector and agent panels adapt without covering one another.

## 10. First Implementation Slice

Build the smallest vertical proof in Sigil Chat:

1. A typed context store with location, ordered selection, focus, bounded
   semantic activity, and allowlisted state.
2. Explicit React APIs for routes and components to publish those values.
3. A compact HUD composer with a context inspector, streaming state, collapse,
   and an escape hatch to the existing full-screen chat variant.
4. Per-turn capture through Eve's supported structured extension point.
5. A minimal node-and-port graph editor backed by the existing graph engine.
6. Gonk tools to inspect a graph, inspect a selected node, add a node, connect
   nodes, update an input, run the graph, and undo the last mutation.
7. Proof that those tools resolve the selected resource, preserve graph
   validity, and update the visible workspace through its normal data path.

The next graph-tool tranche is a single safety layer rather than a collection
of unrelated commands:

1. Machine-readable reducer discovery with socket types, defaults, constraints,
   and examples.
2. Dry-run planning that returns validation issues, computed outputs, and a
   proposed graph diff without mutation.
3. Atomic batch commit of that same plan, consuming one revision and writing
   nothing when validation fails.

The agent-facing mutation surface presents this as one typed `graph-edit`
operation whose ordered `actions` array may mix node creation, updates,
movement, connections, and removals. Related edits therefore require one tool
call and one approval, and either land as one revision or do not land at all.
Single-action tools remain conveniences, not the path the agent should use to
construct or refactor a graph section.

Selection, focus, viewport, and highlighting remain Sigil-owned ephemeral UI
state. They may be exposed through a live workspace-awareness bridge, but must
not be smuggled into the durable graph document or Gonk's graph mutation API.

### Port lineage from Oubliette and Basilisk

Oubliette's surviving React Flow implementation distinguished broad source and
target handles, while its facet relations carried the more useful semantics:
direction, stable ordering, weight, and selected context keys. Basilisk's core
idea was likewise not a visual handle style; it was that several independently
computed facets could feed an ordered contextual assembly downstream.

Sigil Chat keeps that useful lineage but makes the contract explicit at the
port rather than inferring it from node categories:

- stable machine names plus human labels and descriptions;
- a declared value kind and semantic role such as value, condition,
  collection, context, or trigger;
- explicit accepted source kinds instead of universal untyped handles;
- single versus ordered multi-connection cardinality;
- validation and execution that consume every connection on a multi-input
  port in stable order.

Direction remains visually consistent—inputs on the left, outputs on the
right—while shape communicates cardinality: round handles are single-input and
square handles accept many. Color is reserved for direction/active signal, not
reused as an undocumented type legend.

Prompt built-ins stop at composition: JSON context, templates, role/content
messages, and ordered message lists. Model execution is an effectful reducer
registered by the Eve/local-Codex host, not a core reducer with provider or
credential knowledge.

Do not port Atelier's old hook wholesale. Its useful idea was that UI context
could spare the user from restating the screen; its DOM scraping and interaction
history are implementation artifacts we should retire.
