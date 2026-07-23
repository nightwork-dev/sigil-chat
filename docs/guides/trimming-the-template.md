# Trimming the template

Sigil Chat ships with demonstration surfaces alongside the real chat product,
inherited partly from the `sigil-design` template lineage and partly built as
worked examples of the domain-outcome/attention patterns. This guide
classifies every route and package by what actually consumes it, so you can
delete what you don't need without guessing.

## Routes (`apps/web/src/routes`)

### Core agent surfaces — keep

| Route             | Why it's core                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `_app/chat.tsx`   | The chat workspace itself — `AppChat`, the full-page consumer of the shared agent session.                                     |
| `_app/skills.tsx` | Searchable Eve capability catalog with an honest Gonk Core lifecycle boundary — the operational view of what the agent can do. |
| `_app/index.tsx`  | Redirects to the canonical agentic workspace.                                                                                  |

### Demonstration workspaces — pattern reference, delete per-app

These show the domain-outcome and attention patterns in `building-workspaces.md`
end to end, but are demo domains (a reducer graph, a draft article review
document, a stat dashboard), not part of the chat product itself.

| Route                      | Backing feature                                                 | Demonstrates                                                                                                                       |
| -------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `_app/demos.studio.tsx`    | `@/features/studio/reducer-studio` (`ReducerStudio`)            | Typed reducer graph editing with an overlaid agent HUD — the richest `sigil-graph-*` tool consumer.                                |
| `_app/demos.review.tsx`    | `@/features/review/review-workspace` (`ReviewWorkspace`)        | The full domain-outcome loop (`sigil-review-*` tools → `clientCommand` → React Query invalidation) and `AttentionProvider` wiring. |
| `_app/demos.evidence.tsx`  | `@/features/evidence/evidence-room` (`EvidenceRoom`)            | Authenticated evidence resources, distillation, and citation-backed agent questions.                                               |
| `_app/demos.artifacts.tsx` | `@/features/artifacts/artifact-workspace` (`ArtifactWorkspace`) | Artifacts produced through authenticated agent tool calls.                                                                         |

Before deleting `studio` or `review`, note they're also the only two consumers
of `@workspace/graph`/`@workspace/graph-store` and `@workspace/review`/
`@workspace/review-store` respectively (see package table below) — removing
the route without removing the backing package leaves an unused dependency.

### Inherited `sigil-design` scaffold — safe to delete, not chat product

Confirmed to exist and unrelated to the chat/agent product; component-catalog
and layout-shell demonstrations carried over from the template lineage. Per
`.agents/index.md`: "Treat it as reference material for the shell patterns,
not as something to extend for chat features."

- `showcase.tsx` + `showcase/*` (constraints, creative, displays, editors,
  feedback, graph, guide, hooks, image, instruments, layout, media, overlays,
  primitives, review, sequencer, temporal, timeline, tweak, typography) — the
  full `@workspace/ui` component catalog.
- `gallery.tsx` + `gallery/*` (blocks, layouts, views)
- `examples.tsx` + `examples/*` (canvas, chat, data, docs, index, landing,
  playground, report)
- `sidebar.$.tsx`, `sidebar.index.tsx`
- `footer.tsx` + `footer/*` (chat, index)
- `menubar.tsx` + `menubar/*` (index, workflow)
- `split.tsx` + `split/*` (`$id`, index)
- `settings.tsx` + `settings/*` (appearance, general, index, notifications)
- `inspector.tsx` + `inspector/*` (index)

All of these were verified present with `find apps/web/src/routes -type f`
at doc-writing time — check the actual tree before trusting this list, since
routes churn faster than docs.

## Packages (`packages/`)

Verdicts below come from `rg` for each package's import specifier across
`apps/` and `packages/` — "used by" lists every consumer found, "delete
freely" means the grep returned nothing outside the package's own source.

| Package                                        | Used by                                                                                                                                                                   | Verdict                                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@workspace/ui`                                | Every route and most components (shadcn base, tokens, hooks)                                                                                                              | Load-bearing. Keep.                                                                                                                                         |
| `@workspace/agent-contracts`                   | `packages/agent-tools`, `apps/agent`, `apps/web/src/lib/agent-client-command.ts`, `apps/web/src/lib/agent-dom-effects.ts`                                                 | Load-bearing bridge between application tool results, the agent host, and TanStack client projection.                                                       |
| `@workspace/agent-tools`                       | `apps/agent/agent/lib/application-services.ts`, `apps/web/src/lib/skills.server.ts`                                                                                       | The one application-tool implementation. Delete only if the product no longer exposes an agent tool registry.                                               |
| `@workspace/artifact-store`                    | `apps/agent`, `apps/web`, `packages/agent-tools`                                                                                                                          | Shared artifact repository used directly by TanStack and native agent tools.                                                                                |
| `@workspace/chat`                              | `apps/web/src/components/agent/agent-chat.tsx`, `packages/ui/src/components/views/chat.tsx`, `examples/chat.tsx`, `examples-gallery.tsx`, `apps/web/vite.config.ts`       | Load-bearing — the real chat message/input/streaming components used by `AppChat`. Keep.                                                                    |
| `@workspace/graph`, `@workspace/graph-store`   | `packages/agent-tools/src/graph.ts`, `apps/agent`, `apps/web/src/features/studio`                                                                                         | Powers the `sigil-graph-*` tools and Studio. Delete only if you delete both.                                                                                |
| `@workspace/review`, `@workspace/review-store` | `packages/agent-tools/src/review.ts`, `apps/agent`, `apps/web/src/features/review`, `apps/web/src/lib/review-document.ts`                                                 | Powers the `sigil-review-*` tools and Review. Delete only if you delete both.                                                                               |
| `@workspace/data`                              | `packages/data/src/components/entity-browser.tsx`, `packages/ui/src/components/views/entity-browser.tsx`, `apps/web/src/routes/examples/data.tsx`, `examples-gallery.tsx` | Only reached from the `_app/data.tsx` demo workspace and the `examples/` scaffold. Delete freely if you delete both.                                        |
| `@workspace/canvas`                            | `apps/web/src/routes/examples/canvas.tsx`, `examples-gallery.tsx`                                                                                                         | Only reached from the `examples/` scaffold — **not** `_app/canvas.tsx`, which is a separate, unrelated demo route. Delete freely if you delete `examples/`. |
| `@workspace/file-store-core`                   | `packages/review-store/src/repository.ts`, `packages/graph-store/src/repository.ts`                                                                                       | Internal dependency of the two `-store` packages above, not imported directly by any app. Delete only alongside both stores.                                |

## Deletion recipe

For any route + package pair you've decided to remove (example: dropping the
Studio workspace and the graph tools):

1. `rm apps/web/src/routes/_app/demos.studio.tsx` and its backing feature
   directory (`apps/web/src/features/studio/`).
2. Remove the corresponding registration and domain module from
   `packages/agent-tools/src/registry.ts`.
3. `rm -rf packages/graph packages/graph-store` (or `packages/review
packages/review-store`, `packages/data`, or `packages/canvas`
   — whichever you're dropping).
4. Remove the corresponding `"@workspace/<name>": "workspace:*"` line from
   `apps/web/package.json`, `apps/agent/package.json`, and/or
   `packages/agent-tools/package.json`, and
   the matching path entry from `apps/web/tsconfig.json` `paths` if present.
5. Remove the package's `@source` line from
   `packages/ui/src/styles/globals.css` if one was added for it.
6. `pnpm install` to relink the workspace.
7. `pnpm --filter web typecheck` and `pnpm --filter @workspace/agent-tools typecheck`
   to confirm nothing else referenced the removed
   surface.

If you're only removing a route from the inherited `sigil-design` scaffold
(showcase/gallery/examples/etc.) with no package consequence, steps 1 and 7
are the whole recipe.
