# Build brief — PROJ.2: thread binding + project-aware chat navigation

> Worktree: `sigil-chat-proj2` (branch `proj2/thread-binding`, off `dev`)
> Spec: `docs/specs/PROJECT-WORKSPACE-KNOWLEDGE-SPEC.md` §1–3
> Story: `sigil-roadmap` PROJ.2
> Builds on: PROJ.1 (registries + workspace tier), already merged to `dev`.

Implement the container hierarchy in the chat product: bind threads to
workspaces, derive the project through the registry, and give the chat surface
the project/workspace/thread chrome. The zero-config single-user path must stay
frictionless via a per-user personal project.

This is a **taste-bearing UI lane** — the navigation chrome should feel like it
belongs in the existing Sigil Chat surface, not bolted on. Reuse existing
`@workspace/ui` / sigil components and the app's established patterns before
inventing anything. Match the surrounding code's density, naming, and idiom.

## What PROJ.1 already gave you (read these first)

- `apps/agent/agent/lib/project-registry.ts`, `workspace-registry.ts`,
  `project-workspace-registries.ts` — Mirk-backed registries, first-boot seed.
- `apps/gonk/src/registry/containers.ts` — `sigil-project-*` / `sigil-workspace-*`
  CRUD tools.
- `apps/gonk/src/artifact-scope.ts` — `RESOURCE_SCOPE_TIERS` now includes
  `workspace`. Tier is **location, not authorization**.
- `apps/web/src/lib/agent-scope-authorization.server.ts` — membership-gated
  proof issuance. Note PROJ.1's "Known issues": the mutation surface has
  accepted authz gaps — **do not build PROJ.2 to depend on registry-mutation
  authz guarantees that aren't yet enforced.** Read-path scope proofs are sound.

## Anchors for this work

- **Thread model:** `apps/web/src/lib/agent-threads-domain.ts:23` (`AgentThread`),
  `agent-threads.ts`, `agent-threads.server.ts`. This is where `workspaceId`
  lands.
- **Chat surface:** `apps/web/src/components/app-chat.tsx`,
  `components/agent/agent-chat.tsx` — where the project switcher / workspace
  list / grouped-thread nav goes.
- **Blackboard:** `apps/web/src/lib/blackboard.ts`, `blackboard.server.ts`,
  `components/agent/session-blackboard.tsx`, and the scope wiring in
  `apps/agent/agent/lib/sigil-context.ts`. Extend from session-tier to
  workspace/project tiers using the **same store keyed by scope id** — do not
  fork a second store.
- **Seed precedent:** `PersonaRegistry` first-boot seeding in
  `apps/agent/agent/lib/memory.ts` — mirror it for the per-user personal
  project.

## Acceptance criteria (from the story — each must be real, tested)

1. `AgentThread` gains optional `workspaceId`; `projectId` is **derived through
   workspace containment** (registry lookup), never duplicated as an independent
   field. Unbound threads (no `workspaceId`) still work — they resolve to the
   user's personal project.
2. Chat surface provides a **project switcher, workspace list, and threads
   grouped within their workspace**. Reuse existing sigil nav/list components.
3. A **personal project per user** preserves the zero-config path — seeded on
   first boot like personas; a fresh user with no explicit project lands in it
   with zero setup.
4. **Blackboard** supports session / workspace / project tiers via the same
   scope-keyed store — each container gets its shared scratch surface; nearest
   tier wins on read per the spec's session→workspace→project resolution.
5. Container resolution uses the registry-backed scope machinery + the
   `workspace` tier; no scope ids are parsed for containment (registry lookup
   only, per spec §1).

## Constraints & guardrails

- **No `useEffect` for data/derived state** — React Query for server data,
  `useMemo`/`useSyncExternalStore` for derived. Domain hooks live in `lib/*.ts`
  with key factories (see the React component standards this repo follows).
- **Compound components** for the project/workspace/thread entities if they
  render in more than one place (Root/Parts + context).
- **No brittle count assertions** in tests — assert containment/derivation
  invariants and behavior, not exact list sizes.
- Keep server-only code (registry access, Mirk) behind `.server.ts` boundaries;
  don't pull `@gonk/store`/Mirk into a client bundle.
- Migration-free: existing `project`-scoped data and unbound threads keep
  working; `workspace` is purely additive.

## Definition of done

- All five acceptance criteria implemented with meaningful tests.
- `pnpm -w typecheck` clean; affected package test suites green (`apps/web`,
  `apps/agent`, `apps/gonk`).
- A short note in this file (or a `PROJ2-NOTES.md`) on any spec divergence and
  anything left for a follow-up.
- **Do not merge to dev.** Leave the branch ready for review; a human verifies
  the UI in a browser (this repo's rule — agents run headless checks only).
