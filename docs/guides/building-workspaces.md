# Building workspaces

A "workspace" here means an application surface (review, studio, dashboard)
that mounts the agent alongside domain UI, and keeps both in sync: a tool
call can change application data, and application state can inform the
agent's next turn. This guide covers the route/content split, the
domain-outcome loop from a real tool result to a React Query cache update,
and the attention/context tray that carries workspace state to the agent.

## Route vs. content component

Every product route under `apps/web/src/routes/_app/` is a thin wrapper; the
actual UI lives in `apps/web/src/features/<name>/` or
`apps/web/src/components/`. For example,
[`apps/web/src/routes/_app/review.tsx`](../../apps/web/src/routes/_app/review.tsx)
just wires `Route` to a component:

```ts
export const Route = createFileRoute("/_app/review")({
  component: ReviewWorkspace, // from "@/features/review/review-workspace"
})
```

and [`_app/studio.tsx`](../../apps/web/src/routes/_app/studio.tsx) does the
same for `ReducerStudio` from `@/features/studio/reducer-studio`. The route
file's job is routing plus the mandatory ancestor-path/chrome-description
header comment (see `.agents/index.md` and `trimming-the-template.md`); the
feature component owns providers, layout, and the agent HUD. Follow this
split for a new workspace: create `apps/web/src/features/<name>/<name>.tsx`
(or reuse an existing feature if you're extending one), then point a new
`_app/<name>.tsx` route file at it.

## The domain-outcome loop: a tool result becomes a cache update

Walk one real path. `sigil-review-update-passages` in
[`apps/gonk/src/registry.ts`](../../apps/gonk/src/registry.ts) mutates the
review document, then returns a `clientCommand` alongside its data:

```ts
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
```

That `clientCommand` travels back through Eve to the browser and is dispatched
as a DOM `CustomEvent` (`AGENT_CLIENT_COMMAND_EVENT`, defined in
`apps/web/src/lib/agent-client-command.ts`). One listener for that event is
registered once, globally, by `AgentDomainOutcomeReconciler` — mounted in
[`apps/web/src/routes/__root.tsx`](../../apps/web/src/routes/__root.tsx)
(`<AgentDomainOutcomeReconciler />`), so no per-workspace wiring is needed to
receive outcomes. The reconciler
([`apps/web/src/lib/agent-domain-outcomes.tsx`](../../apps/web/src/lib/agent-domain-outcomes.tsx))
does the real work:

```tsx
const reviewDocumentChangedHandler: AgentOutcomeReconciliationHandler = {
  kind: "review.document.changed",
  schema: { /* Standard Schema validating the outcome shape */ },
  reconcile: async (outcome, context) => {
    await context.invalidate([reviewDocumentKeys.detail(outcome.resource.id)])
  },
}

export function createAgentDomainOutcomeDispatcher(queryClient: QueryClient) {
  return createReactQueryOutcomeDispatcher({
    queryClient,
    handlers: [reviewDocumentChangedHandler],
    duplicateKindPolicy: "reject",
    unhandledOutcomePolicy: "ignore",
  })
}
```

`createReactQueryOutcomeDispatcher` and the `AgentOutcomeReconciliationHandler`
type come from `@zigil/agent-react-query` — the outcome dispatch mechanism
itself is a released package, not app-owned. What's app-owned is the single
handler registered above: it matches outcomes of `kind:
"review.document.changed"` and invalidates the React Query key
`reviewDocumentKeys.detail(outcome.resource.id)` (from
`apps/web/src/lib/review-document.ts`), which triggers a refetch anywhere
`useReviewDocument()` is mounted. That's the whole loop: **tool handler
returns a `clientCommand` → dispatched as a browser event → reconciler
matches it by `kind` → invalidates the query key that owns that data.**

To wire a new domain outcome for a new workspace: have your tool's handler
return a `clientCommand` of `type: "agent.domain.outcome"` with a `kind` you
choose, register a new handler object in the `handlers` array in
`agent-domain-outcomes.tsx` that matches that `kind` and invalidates the
right query key, and nothing else — the dispatcher, the event, and the
mount point are already shared infrastructure.

(The `agentDomainOutcomeFromCommand` function in the same file also
translates two legacy `clientCommand` shapes, `review.annotation.add` and
`review.passage.update`, into the same outcome shape for backward
compatibility — new tools should emit `agent.domain.outcome` directly rather
than adding a third legacy shape.)

## The attention/context tray: workspace state reaching the agent

Separately from outcomes flowing *out* of a tool call, workspace state flows
*into* the agent as `clientContext` on every send. The hook that does this is
[`apps/web/src/hooks/use-app-agent-session.ts`](../../apps/web/src/hooks/use-app-agent-session.ts):

```ts
const send = useCallback<AgentRuntimeSession["send"]>(
  async (input) => {
    const attachments = getTurnContextAttachments()
    const result = await session.send({
      ...input,
      ...(attention || attachments.length > 0
        ? {
            clientContext: serializeAttentionDraft(
              attention,
              getAttentionPrivacyLevel(),
              getAttentionExclusions(),
              attachments,
            ),
          }
        : {}),
      headers: {
        ...input.headers,
        [TOOL_APPROVAL_HEADER]: getToolApprovalMode(),
      },
    })
    ...
  },
  [attention, session],
)
```

`attention` comes from `useAttention()` (`@zigil/agent-react`), which reads
whatever the surrounding `AttentionProvider` publishes. A workspace opts in
by wrapping its content in `AttentionProvider` and reporting selections
through it — `apps/web/src/features/review/review-workspace.tsx` does this
(`AttentionProvider`, `AttentionContext`, `AttentionSelection` all imported
from `@zigil/agent-react`), so as the user selects a passage or
annotation in the review UI, that selection becomes part of the next agent
turn's `clientContext` automatically, with no per-call plumbing in the
component that sends the message.

Selections describe current attention, so they accompany every turn while
they remain selected unless the user excludes them. Activity is different:
Sigil Chat keeps a delivery cursor per agent thread and sends only semantic
events recorded since that thread's last successful turn. A failed send does
not advance the cursor, and activity that occurs while a turn is in flight is
left pending for the next turn. This cursor is application policy over the
bounded telemetry buffer; it is not durable agent memory.

Every part of what gets serialized is user-inspectable and user-editable
before it's sent, via `ContextTray`
([`apps/web/src/components/agent/context-tray.tsx`](../../apps/web/src/components/agent/context-tray.tsx)),
a compound `Root`/`Trigger`/`Content` component. It surfaces:

- **Ordered selections** — the current `AttentionSelection`s, each with a
  button to pin it as an explicit turn/session attachment.
- **Turn and session attachments** — `TurnContextAttachment`s with a
  `ContextRetention` of `"turn"` or `"session"`, reorderable and removable.
- **Recent meaningful activity** — bounded `AttentionActivityEvent` history.
- **A privacy selector** — `AttentionPrivacyLevel`: `"minimal"`, `"focused"`,
  or `"expanded"`, set via `setAttentionPrivacyLevel()`.
- **An exact serialized preview** — the literal JSON payload the next turn
  will send, rendered with `CodeBlock`.

The instructions given to the agent (`apps/agent/agent/instructions.md`) are
explicit that this is "task-relevant attention, not exhaustive surveillance"
and that the user controls its privacy level — treat that framing as a
product constraint, not just documentation, when extending what a workspace
reports into attention.
