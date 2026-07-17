# Agentic Application State Through React Query

> Date: 2026-07-16
> Status: Draft for independent review
> Primary owner: Sigil Chat application
> Related:
>
> - `docs/specs/AGENT-CONTEXT-AWARENESS-SPEC.md`
> - `docs/specs/AGENT-EMBEDDING-SPEC.md`
> - `docs/specs/AGENT-REVIEW-WORKSPACE-SPEC.md`
> - `docs/specs/GONK-MCP-AUTH-INTEGRATION-SPEC.md`

## 1. Decision

React Query is the authoritative client-side projection of durable application
state, regardless of whether a mutation originated from direct user
interaction or an embedded agent.

The governing rule is:

> **If an agent action changes something the user could later reload, query,
> undo, compare, or collaborate on, that change must travel through the same
> repository, server-function, and React Query boundary as the equivalent human
> action.**

Agent-specific client commands are reserved for ephemeral presentation effects
such as highlighting, focusing, selecting, scrolling, opening an inspector, or
changing a viewport. They must not become a second application state store.

## 2. Why this matters

The product is an agentic application, not a chat interface that happens to
modify nearby React component state.

Users and agents operate the same domain objects:

- reducer graphs;
- review documents and passages;
- annotations;
- decisions;
- revision and acceptance state;
- future editor documents, schedules, dashboards, and operational records.

If agent mutations bypass the normal application data path, the visible UI may
temporarily look correct while the durable application is wrong. Typical
failures include:

- agent changes disappearing after navigation or reload;
- one panel showing a different value from another;
- polling overwriting optimistic local state;
- undo/history omitting agent changes;
- stale revisions silently replacing newer work;
- other clients failing to observe the mutation;
- duplicated domain logic in a tool handler and a component event listener;
- tests proving the transcript but not the application state.

The agent must be another authorized actor over the application's domain model,
not a privileged component-state escape hatch.

## 3. Current state

The implementation is partially aligned:

### Correct or directionally correct

- Reducer graph reads use a domain query hook.
- Direct graph edits use server functions wrapped by React Query mutations.
- Graph mutations apply optimistic cache updates using the same pure reducer as
  the repository.
- Review document reads use a domain query hook.
- Direct passage edits use a server function and React Query mutation.
- Agent passage edits update the shared review repository and then invalidate
  the review-document query.
- Attention selection, focus, hover, and recent semantic activity remain local
  ephemeral state.
- DOM highlighting uses semantic target identifiers and is intentionally
  temporary.

### Incorrect or transitional

- Review annotations are copied into component `useState` rather than projected
  from the review-document query.
- Completed tool calls dispatch arbitrary stringly typed `window` events.
- Some durable agent outcomes are interpreted by route components and applied
  to local state.
- Graph and review queries poll every second to discover out-of-process
  mutations.
- Tool completion, durable mutation reconciliation, and transient UI effects
  share one loose client-command path.
- The generic agent package can emit application commands without a typed
  application-owned handler contract or acknowledgement.

These transitional paths must not become the permanent architecture.

## 4. State ownership

Every piece of state belongs to exactly one of four categories.

| State | Authoritative owner | Client projection |
| --- | --- | --- |
| Durable domain state | Application repository/server | React Query |
| Agent conversation and streaming | Eve session | Eve React integration |
| Current attention and interaction telemetry | Sigil attention store | `useSyncExternalStore` / React context |
| Temporary visual effects | Workspace DOM/effect host | Local component/effect state |

### 4.1 Durable domain state

Examples:

- graph nodes, edges, reducer inputs, revision and history;
- review passage text;
- annotations and decisions;
- acceptance checks and receipts;
- document revision metadata.

Requirements:

- stored in an application repository;
- read through a server function;
- exposed through a domain-specific React Query hook;
- mutated through a server function or a Gonk tool calling the same repository;
- revision-checked where concurrent edits are possible;
- reflected in all consumers through cache reconciliation or invalidation;
- reload-safe and observable by another client.

### 4.2 Agent session state

Examples:

- messages;
- reasoning and streamed text;
- tool-call lifecycle;
- input and approval requests;
- connection/error status.

Eve owns this state. It must not be copied into React Query merely to make every
hook look uniform.

### 4.3 Attention state

Examples:

- route and workspace;
- ordered selection;
- focused field;
- sustained registered hover;
- bounded semantic activity history;
- selected context privacy level.

This state is high-frequency, ephemeral, session-local, and non-authorizing. It
remains outside React Query unless a concrete cross-client presence feature is
introduced.

### 4.4 Presentation effects

Examples:

- pulse or spotlight a passage;
- dim unrelated nodes;
- scroll a target into view;
- focus an editor;
- open the review inspector;
- fit the graph viewport to a subgraph.

These effects may use local component state, semantic DOM target registration,
or an application-level effect dispatcher. They do not modify durable domain
records.

## 5. Mutation flow

Human and agent mutations converge at the repository:

```text
Human UI
  -> domain React Query mutation
  -> server function
  -> repository
  -> revisioned result
  -> React Query cache

Agent
  -> Eve tool call
  -> Gonk registry tool
  -> same repository
  -> revisioned result
  -> typed tool outcome
  -> application reconciler
  -> React Query cache/invalidation
```

The two paths may have different transport and approval steps, but they must
produce the same domain result and converge on the same query keys.

## 6. Query-domain organization

Each domain owns its server functions, query-key factory, query hooks, mutation
hooks, and reconciliation helpers in one module.

Conceptual shape:

```ts
export const reviewKeys = {
  all: () => ["review-documents"] as const,
  detail: (id: string) => ["review-documents", id] as const,
};

export function useReviewDocument(id: string) {
  return useQuery({
    queryKey: reviewKeys.detail(id),
    queryFn: () => getReviewDocumentFn({ data: { id } }),
  });
}

export function useUpdateReviewPassages(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReviewPassageUpdateInput) =>
      updateReviewPassagesFn({ data: { id, ...input } }),
    onSuccess: ({ document }) => {
      queryClient.setQueryData(reviewKeys.detail(id), document);
    },
  });
}
```

Components import these hooks. Components do not construct query keys, call
repositories, or reproduce server mutations inline.

## 7. Agent outcome reconciliation

### 7.1 Purpose

A successful Gonk mutation may happen outside the current browser request. The
browser therefore needs a typed indication of which application state changed.

This indication is a cache-reconciliation hint, not the mutation itself.

### 7.2 Durable outcome contract

Gonk-backed application tools should return a domain outcome alongside their
human/model-readable result:

```ts
interface AgentDomainOutcome {
  kind: string;
  resource: {
    kind: string;
    id: string;
    revision?: number;
  };
  operation: string;
  changedIds?: readonly string[];
}
```

Examples:

```ts
{
  kind: "review.document.changed",
  resource: {
    kind: "review-document",
    id: "weekly-tournament-liveops",
    revision: 12,
  },
  operation: "annotations.add",
  changedIds: ["annotation-42"],
}
```

```ts
{
  kind: "graph.changed",
  resource: {
    kind: "reducer-graph",
    id: "launch-budget",
    revision: 8,
  },
  operation: "batch.apply",
  changedIds: ["node-a", "node-b", "edge-c"],
}
```

The outcome must not contain provider credentials, unbounded document bodies,
or authoritative identity claims.

### 7.3 Application-owned reconciler

The application registers typed handlers above route page swaps:

```ts
interface AgentOutcomeHandler<TOutcome extends AgentDomainOutcome> {
  kind: TOutcome["kind"];
  reconcile(
    outcome: TOutcome,
    queryClient: QueryClient,
  ): void | Promise<void>;
}
```

Handlers normally:

- invalidate the exact affected query;
- replace cache data when the tool returned a complete authoritative document;
- patch cache data only when the patch is versioned, complete, and simpler than
  a refetch;
- reject or refetch when the outcome revision conflicts with cached state.

The reconciler must be:

- typed;
- application-owned;
- idempotent by tool-call/outcome identifier;
- safe when the affected route is not mounted;
- observable in tests;
- explicit about unknown outcome kinds.

The generic `@workspace/agent` package may transport and dispatch an outcome,
but it must not import application query keys or domain types.

### 7.4 Reconciliation is not mutation

The browser must never interpret an outcome as permission to perform the
durable mutation locally.

Incorrect:

```text
tool says "annotation added"
-> component constructs annotation
-> component inserts it into local state
```

Correct:

```text
tool already added annotation through repository
-> outcome identifies changed review document
-> application invalidates review query
-> repository result becomes visible
```

## 8. Ephemeral client commands

Client commands remain available for effects that are not durable domain
mutations.

Allowed command families:

- `ui.highlight`;
- `ui.focus`;
- `ui.scroll`;
- `ui.selection.set`;
- `ui.viewport.fit`;
- `ui.panel.open`.

Requirements:

- semantic application target IDs, never arbitrary CSS selectors;
- validated command shapes;
- bounded batch size and duration;
- no execution of arbitrary code;
- no domain record creation or mutation;
- effect cleanup;
- reduced-motion support;
- a structured not-found result when targets are absent.

The existing generic `AgentClientCommand { type: string; payload?: unknown }`
is too weak for the permanent public contract. Either replace it with a
discriminated command union or require commands to pass through a registered
validator before dispatch.

DOM events may remain an internal implementation detail for semantic effects,
but they are not an application mutation bus.

## 9. Review workspace migration

The review document query becomes the source of:

- passages;
- annotations;
- decisions;
- revision history;
- acceptance checklist state;
- review debt derived from queried annotations.

Migration:

1. Remove the component-owned annotation collection.
2. Render annotations from `useReviewDocument()`.
3. Add server functions and React Query mutation hooks for direct human
   annotation, decision, debt, and acceptance operations.
4. Ensure Gonk review tools call the same review repository methods.
5. Change completed review tools to return `review.document.changed`.
6. Reconcile by revision-aware cache replacement or exact query invalidation.
7. Remove `review.annotation.add` and `review.passage.update` durable mutation
   handling from the browser event listener.
8. Keep `ui.highlight` and related semantic effects as ephemeral commands.

An agent-authored annotation must survive reload and appear identically in the
feedback feed, debt calculations, adjacent-passage context, and subsequent
agent inspection.

## 10. Graph workspace migration

The graph is already closer to the target.

Required refinements:

1. Preserve the existing graph query-key factory and mutation hooks.
2. Return a `graph.changed` outcome from every successful Gonk graph mutation.
3. Reconcile the graph query using the returned authoritative document when
   available, otherwise invalidate it.
4. Do not persist selection, focused sockets, highlights, or temporary viewport
   emphasis in the graph document.
5. Preserve revision conflicts and rollback optimistic human mutations when the
   repository rejects them.
6. Ensure layout-only operations do not trigger graph execution.

The current one-second polling may remain temporarily as a fallback during
migration, but it is not the intended primary reconciliation mechanism.

## 11. Synchronization and polling

V1 does not require a new WebSocket infrastructure.

Use this order:

1. immediate cache reconciliation for mutations initiated in the current
   browser;
2. exact invalidation from completed agent outcomes;
3. refetch-on-focus/reconnect for recovery;
4. low-frequency polling only as a temporary cross-process fallback;
5. SSE/WebSocket subscription when genuine multi-client collaboration requires
   push updates.

Polling must not be used to conceal a missing mutation contract. A one-second
poll is especially undesirable for documents and graphs that are otherwise
idle.

When push synchronization is added, it should publish resource/revision
notifications and still let React Query own fetching and cache reconciliation.
The push channel must not become another client-side store.

## 12. Concurrency and revisions

Durable mutable resources carry a revision.

Rules:

- human and agent writes supply an expected revision or equivalent conflict
  guard;
- repositories perform atomic conflict checks;
- batch mutations consume one revision and either fully apply or write nothing;
- stale outcomes do not overwrite newer cached data;
- an outcome with a newer revision may replace or invalidate older cache data;
- an outcome without sufficient authoritative data invalidates rather than
  patches;
- conflict responses identify the current revision and affected resources;
- the UI preserves unsaved user input when refreshing authoritative data.

React Query coordinates cache state. It does not replace repository-level
concurrency control.

## 13. Optimistic updates

Optimistic updates are appropriate for direct, reversible user gestures when
the client can run the exact same pure transition as the server.

Examples:

- committing a dragged graph-node position;
- editing a graph label;
- toggling a lightweight review flag with a known revision.

Agent mutations are not optimistically recreated from transcript text or
client-command payloads. The tool has already run remotely; the client consumes
its authoritative result or refetches.

Every optimistic mutation must:

- snapshot previous cache data;
- apply a deterministic pure transition;
- roll back on failure;
- replace the optimistic result with the server result on success;
- avoid expensive derived computation for layout-only changes.

## 14. Error behavior

| Condition | Required behavior |
| --- | --- |
| Agent tool succeeds and reconciliation succeeds | Updated domain state becomes visible |
| Agent tool succeeds but outcome is unknown | Warn, invalidate a safe parent query if possible, never fabricate state |
| Agent tool succeeds but refetch fails | Preserve current cache, show stale/error state, allow retry |
| Outcome revision is older than cache | Ignore patch; retain newer state |
| Outcome revision is newer but incomplete | Invalidate and refetch |
| Human optimistic mutation fails | Roll back and show error |
| Repository reports revision conflict | Load latest state without discarding unsaved editor text |
| Ephemeral target is absent | Report effect not applied; do not treat tool mutation as failed |
| Browser reloads | Durable agent mutations remain present |

An ephemeral highlight failure must not make a successfully committed document
or graph mutation appear to have failed.

## 15. Testing

### 15.1 Domain queries

1. Review query returns passages, annotations, decisions, history, and
   acceptance state from one repository document.
2. Graph query returns the current revisioned graph.
3. Query-key factories are reused by hooks and reconcilers.

### 15.2 Human mutations

4. Direct passage editing updates the repository and cache.
5. Direct annotation creation updates the repository and cache.
6. Optimistic graph mutation rolls back on repository rejection.
7. Revision conflicts do not silently overwrite newer state.

### 15.3 Agent mutations

8. Agent annotation tool updates the repository.
9. The returned outcome invalidates or replaces the correct review query.
10. The annotation remains after route navigation and full reload.
11. Agent passage edits and graph batches use the same repository methods as
    direct application mutations.
12. Replaying the same completed tool outcome does not duplicate state.
13. An outcome older than the cached revision cannot overwrite it.

### 15.4 Boundary tests

14. `@workspace/agent` imports no application query keys or domain repositories.
15. Review and graph components do not listen for durable mutation events.
16. Durable outcome handlers do not create domain records locally.
17. Attention selection/focus changes produce no React Query network traffic.
18. UI highlight commands do not alter repository or query data.
19. Unknown client-command shapes are rejected.

### 15.5 Live browser acceptance

20. Ask the agent to add annotations to multiple selected passages; all appear
    without manual refresh.
21. Reload; the annotations remain.
22. Open another browser client; it observes the changes through recovery
    polling or push synchronization.
23. Ask the agent to edit a passage while it is locally being edited; the
    conflict is surfaced without silently losing either version.
24. Ask the agent to mutate a graph; the canvas, inspector, run results, and
    revision agree.
25. Ask the agent to highlight a removed target; the durable tool result remains
    successful and the missing effect is reported separately.

## 16. Implementation slices

### Slice 0 — regression lock

- Add tests proving the current annotation local-state divergence.
- Add an agent-outcome replay/idempotency test.
- Record current polling and query keys.

### Slice 1 — review query authority

- Move annotations, decisions, acceptance, and history to the queried review
  document.
- Add missing domain mutation hooks.
- Remove duplicated component state.

### Slice 2 — typed outcome reconciliation

- Define the generic durable outcome envelope.
- Add an application-owned reconciler with registered typed handlers.
- Return revisioned outcomes from review and graph tools.
- Reconcile through React Query.

### Slice 3 — command boundary cleanup

- Restrict client commands to semantic ephemeral UI effects.
- Replace the open string command contract with validated discriminated shapes.
- Remove durable mutation event listeners.

### Slice 4 — polling reduction

- Remove one-second polling when current-browser reconciliation is reliable.
- Retain focus/reconnect recovery.
- Add a lower-frequency temporary fallback or resource revision subscription
  for cross-process changes.

### Slice 5 — live verification

- Exercise human and agent mutations in the review and graph workspaces.
- Verify reload, navigation, concurrency, responsive HUD behavior, and console
  cleanliness.

## 17. Acceptance criteria

- Every durable review and graph value visible in the application comes from a
  React Query cache backed by an application repository.
- Human and agent mutations converge on the same repository operations.
- Completed agent tools reconcile exact domain query keys.
- No route component constructs durable agent-created records from a browser
  event.
- Durable tool outcomes are typed, revision-aware, and idempotent.
- Ephemeral UI commands cannot mutate repositories or query data.
- Attention telemetry remains local and does not generate query traffic.
- Agent changes survive reload, participate in history/conflict behavior, and
  appear to other clients.
- Polling is recovery or temporary compatibility behavior, not the primary
  mutation path.
- Tests and live-browser verification demonstrate the complete loop.

## 18. Non-goals

- Moving Eve conversation state into React Query.
- Moving pointer, focus, hover, or selection telemetry into React Query.
- Treating React Query as the persistent database.
- Replacing repository-level transactions or revision checks.
- Building a general event-sourcing platform.
- Requiring WebSockets before the durable mutation boundary is correct.
- Letting cache invalidation stand in for Gonk authorization or Eve approval.
- Making `@workspace/agent` depend on every consuming application's domain.

## 19. Questions for independent review

1. Is the state taxonomy complete, or does any current state belong to a
   different owner?
2. Is a typed outcome plus query reconciliation the right boundary, or should
   tools always return the complete updated resource?
3. Should the reconciler patch authoritative returned documents, invalidate
   only, or support both under explicit rules?
4. Is a root-level application reconciler preferable to domain hooks consuming
   Eve tool events?
5. Are tool-call ID plus outcome kind/resource sufficient for idempotency?
6. Does any proposed client command still smuggle durable mutation through the
   presentation layer?
7. What minimum push/recovery mechanism is needed before removing one-second
   polling?
8. Does the concurrency contract adequately protect an active text editor from
   an agent mutation?
9. Should annotations, decisions, and acceptance remain one review-document
   aggregate or become separately keyed queries?
10. Which parts belong in reusable Sigil packages versus the Sigil Chat
    application?

## 20. Recommended judgment

Repair the durable state boundary before adding more agent mutation features.

React Query should not own everything. It should own exactly the client
projection of durable application truth. Eve remains authoritative for the
conversation, the attention store remains authoritative for immediate shared
attention, and the workspace remains authoritative for temporary visual
effects.

Once this boundary is enforced, adding agent capabilities becomes ordinary
application work: define a repository operation, expose it through Gonk,
authorize and approve it, then reconcile the affected query. No feature should
need a second agent-only state path.
