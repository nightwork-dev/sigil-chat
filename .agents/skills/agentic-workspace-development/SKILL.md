---
name: agentic-workspace-development
description: Build or repair a Sigil Chat workspace that the persistent agent can perceive and affect. Use when creating a workspace or route, publishing attention or resource scope, exposing an application tool, connecting a tool result to visible UI, diagnosing route-only or missing agent context, or adding domain-outcome reconciliation.
---

# Agentic Workspace Development

Build the complete loop:

`route/navigation → workspace identity → attention → resource scope → tool → domain outcome → query reconciliation`

A workspace that renders but breaks this loop is incomplete.

## 1. Establish the workspace

1. Read `extending-this-template`.
2. Add a thin route under `apps/web/src/routes/_app/`.
3. Put stateful UI under `apps/web/src/features/<name>/`.
4. Register navigation in the existing `_app` shell.
5. Preserve the mandatory route header.

Do not mount another shell, agent session, or visible agent HUD.

## 2. Publish agent context

The authenticated shell owns the only `AttentionProvider`. Never mount a local
provider inside a workspace; the persistent HUD above the route cannot read it.

Publish context through:

```tsx
import {
  usePublishWorkspaceAttention,
  usePublishWorkspaceResourceScope,
} from "@/components/agent/workspace-attention"

usePublishWorkspaceAttention({
  application: "sigil-chat",
  route: "/example",
  workspace: { kind: "example", id: exampleId, label: "Example" },
  selection,
  selections,
  history: telemetry.history,
})

usePublishWorkspaceResourceScope(null)
```

Use `null` only as a deliberate session-scope fallback. Publish an authorized
project or domain scope when tools must act on durable workspace resources.
Both hooks clear their values on unmount.

Keep attention task-relevant and inspectable. Publish identity and current
selection, not an exhaustive copy of workspace state.

## 3. Complete mutations end to end

For an agent mutation:

1. Define the domain repository and React Query key factory.
2. Add the authorized application tool through `adding-gonk-tools`.
3. Return a typed domain outcome from the tool.
4. Register the outcome kind in
   `apps/web/src/lib/agent-domain-outcomes.tsx`.
5. Validate the outcome and invalidate or update the same domain query keys.

Do not poll, manually refresh, or let components invent independent query keys.

## 4. Verify the actual loop

Add tests proving:

- the workspace publishes identity and selection;
- leaving it clears attention and explicit resource scope;
- the scope policy is intentional;
- each mutating outcome has a reconciler;
- reconciliation invalidates or updates the visible domain query;
- route-only context is distinguishable from substantive workspace context.

Then run:

```bash
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter @sigil-design/chat-overlay test
```

For tool-bearing workspaces, use the real development stack and require one
authenticated tool mutation to update the visible interface. A successful
render or typecheck is not completion evidence.

## Canonical examples

- Shell publication seam:
  `apps/web/src/components/agent/workspace-attention.tsx`
- Attention plus explicit durable scope:
  `apps/web/src/features/evidence/evidence-room.tsx`
- Attention plus deliberate session fallback:
  `apps/web/src/features/review/review-workspace.tsx`
- Outcome reconciliation:
  `apps/web/src/lib/agent-domain-outcomes.tsx`
- Full explanation:
  `docs/guides/building-workspaces.md`
