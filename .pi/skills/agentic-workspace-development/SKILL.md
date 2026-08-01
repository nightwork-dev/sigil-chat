---
name: agentic-workspace-development
description: Build or repair a Sigil Chat workspace that the persistent agent can perceive and affect. Use when creating a workspace or route, publishing attention or resource scope, exposing an application tool, connecting a tool result to visible UI, diagnosing route-only or missing agent context, or adding domain-outcome reconciliation.
---

# Agentic Workspace Development

REQUIRED LOOP:

`route/navigation → workspace identity → attention → resource scope → tool → domain outcome → query reconciliation`

A rendered workspace with a broken loop is NOT complete.

## Workspace rules

- [ ] Read `extending-this-template`.
- [ ] Add a thin `_app` route with the mandatory header.
- [ ] Put stateful UI under `apps/web/src/features/<name>/`.
- [ ] Register navigation in the existing shell.
- [ ] DO NOT mount another shell, agent session, or HUD.

## Context rules

- [ ] Use `usePublishWorkspaceAttention`.
- [ ] DO NOT mount a workspace-local `AttentionProvider`.
- [ ] Publish workspace identity plus current task-relevant selection.
- [ ] Use `usePublishWorkspaceResourceScope` for every agentic workspace.
- [ ] Pass an authorized durable scope, or `null` as a deliberate session
      fallback.
- [ ] Confirm both publications clear on unmount.

Canonical seam:
`apps/web/src/components/agent/workspace-attention.tsx`.

## Mutation rules

- [ ] Define the domain repository and React Query key factory.
- [ ] Add authorized tools through `adding-gonk-tools`.
- [ ] Return a typed domain outcome.
- [ ] Register the outcome in
      `apps/web/src/lib/agent-domain-outcomes.tsx`.
- [ ] Validate it and invalidate or update the SAME domain query keys.
- [ ] DO NOT poll or manually refresh.

## Verification gate

- [ ] Test workspace identity and selection publication.
- [ ] Test attention and scope cleanup on navigation.
- [ ] Test the explicit scope policy.
- [ ] Test every mutating outcome has a reconciler.
- [ ] Test reconciliation updates the visible domain query.
- [ ] Distinguish route-only context from substantive workspace context.
- [ ] Run `pnpm --filter web typecheck`.
- [ ] Run `pnpm --filter web test`.
- [ ] Run `pnpm --filter @sigil-design/chat-overlay test`.
- [ ] For tool mutations, exercise one authenticated end-to-end update in the
      real development stack.

Read `docs/guides/building-workspaces.md` for the full contract. Use Evidence
for explicit durable scope and Review for deliberate session fallback.
