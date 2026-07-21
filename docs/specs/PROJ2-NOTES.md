# PROJ.2 notes — thread binding + project-aware chat navigation

Implementation notes, divergences from the brief, and explicit follow-ups.
See `PROJ2-BUILD-BRIEF.md` for the acceptance criteria this satisfies.

## Where things live

- `apps/agent/agent/lib/personal-project.ts` (+ `.test.ts`) — deterministic
  `personal:<principalId>` id, `ensurePersonalProject` (first-boot seed,
  mirrors `ensureEveHostedPersona` in `memory.ts`).
- `apps/web/src/lib/agent-threads-domain.ts` — `AgentThread`/`AgentThreadSummary`
  gain optional `workspaceId`; `AgentThreadRepository.create()` accepts it,
  and a new `rebindWorkspace()` moves an existing thread between workspaces
  (or unbinds it) with the same optimistic-revision contract as `rename`.
- `apps/web/src/lib/agent-thread-containers.ts` (+ `.test.ts`) — pure
  containment derivation (`deriveThreadProjectId`, `groupThreadsByWorkspace`,
  `threadsForProject`); no I/O, registry lookup only, never scope-id parsing.
- `apps/web/src/lib/agent-thread-containers.server.ts` — `loadProjectWorkspaceNav`
  wires the pure functions to the real registries + seeds the personal
  project on first request.
- `apps/web/src/lib/project-workspace-nav.ts` — server fn + React Query hook
  (`useProjectWorkspaceNav`) exposing that nav data to the client.
- `apps/web/src/lib/agent-threads.ts` — `createAgentThreadFn` accepts an
  optional `workspaceId` (membership-checked); new
  `rebindAgentThreadWorkspaceFn`/`useRebindAgentThreadWorkspace`.
- `apps/web/src/lib/blackboard-scope.ts` (+ `.test.ts`) — pure tier/key
  logic; `apps/web/src/lib/blackboard.server.ts` gains
  `readScopedBlackboard`/`writeScopedBlackboard` (membership-gated via the
  same `assertAuthorizedScope` Eve's tool scope already uses);
  `apps/web/src/lib/blackboard.ts` gains
  `useContainerBlackboard`/`useWriteContainerBlackboard`.
- `apps/web/src/components/agent/project-workspace-nav.tsx` — project
  switcher + workspace-grouped thread list, rendered inside
  `AgentSessionSwitcher`'s sheet (`agent-chat.tsx`).
- `apps/web/src/components/agent/session-blackboard.tsx` — now tabs across
  Session/Workspace/Project when the active thread resolves a workspace/
  project (workspace tab only appears for a bound thread).

## Divergences / judgment calls

1. **`AgentThreadControls.threads` (published `@zigil/agent-surface`
   contract) has no `workspaceId`.** It's out of this repo's ownership, so
   the conversation sheet now sources full `AgentThreadSummary[]` via
   `useAgentThreads()` directly for grouping, while still using `controls`
   for `activeThreadId`/`selectThread`. If Sigil Agent later adds container
   fields to the contract, this indirection can collapse.
2. **`ProjectWorkspaceNav` and the extended `SessionBlackboard` are plain
   components, not Root/Parts compounds.** Both render at exactly one site
   today, which the repo's own compound-component rule exempts ("single-use
   components that only render in one place"). Promote to Root/Parts the
   moment either gets a second render site (e.g. a dedicated
   project/workspace settings page).
3. **"Nearest tier wins on read" is implemented as pure logic
   (`resolveEffectiveBlackboardTier`) but not wired into an automatic merged
   view.** The UI instead gives the user explicit Session/Workspace/Project
   tabs — each tier's blackboard is its own editable surface, which matches
   "each container gets its shared scratch surface" more directly than a
   silently-merged read would. If the intent was specifically an *agent
   context-injection* resolution order (session → workspace → project) for
   turn assembly rather than a human-facing UI, that's downstream of the
   spec's KB.2 retrieval-contributor activation (`sigil.retrieval` stays
   deliberately dormant per the spec) and is out of PROJ.2's scope as read —
   flagging for whoever picks up KB.2.
4. **No "move thread to a different workspace" UI.** The domain method
   (`rebindWorkspace`) and server fn/hook exist and are tested, but no
   affordance was added to the conversation sheet to invoke it — creating a
   thread with a `workspaceId` works end-to-end (server-validated
   membership), rebinding an existing one is plumbing-only pending a UI
   decision on where that control belongs.
5. **No inline "create project"/"create workspace" UI in chat.** PROJ.1
   already exposes `sigil-project-upsert`/`sigil-workspace-upsert` as Gonk
   tools, so the agent can create/manage them conversationally today; the
   switcher only lists containers the user is already a member of. Adding a
   manual create affordance is a reasonable follow-up but wasn't required by
   the five acceptance criteria.
6. Per the brief's stated known issue, nothing here depends on
   registry-*mutation* authz guarantees — `createAgentThreadFn`'s workspace
   check and the blackboard scope checks both call the same read-path
   `assertRegisteredScopeMembership`/`assertAuthorizedScope` Eve's tool scope
   already relies on.

## Post-review fixes (different-lineage review, pre-merge)

Two should-fixes from the independent review, applied after the initial
report:

1. **Blackboard key collision (ISSUE 1/3).** `blackboardStoreKey`
   (`apps/web/src/lib/blackboard-scope.ts`) mapped `{tier:"session",
   id:"workspace:foo"}` and `{tier:"workspace", id:"foo"}` to the same flat
   store key. Not exploitable today (session ids are always
   `crypto.randomUUID()`), but the safety rested on that invariant being
   unstated and untested. Fixed by rejecting any session-tier id containing
   `:` at the key-derivation boundary, with a regression test in
   `blackboard.server.test.ts` that constructs the collision directly (a
   caller who owns a thread literally named `workspace:foo`, simulating the
   invariant slipping) and asserts the read is refused — this test fails
   against the pre-fix code and passes against the fix, which is the
   falsifiable guard the review asked for.
2. **Optimistic-cache summary drift (ISSUE 2/4).** The client's
   `projectCachedThreadSummary` (`agent-threads.ts`) omitted `workspaceId`,
   which the server's `projectAgentThreadSummary`
   (`agent-threads-domain.ts`) already included — a freshly created/rebound
   thread would render under Personal until the next refetch. Fixed by
   deleting the client-side duplicate and having `cacheThread` call
   `projectAgentThreadSummary` directly (also collapsed a redundant dynamic
   import of the same function inside `listAgentThreadsFn`). Added
   coverage in `agent-threads-domain.test.ts` asserting the summary carries
   `workspaceId` when bound and omits it when unbound/rebound-away, so the
   two projectors can't drift again — there's only one now.

## Verification

- `pnpm --filter web typecheck`, `pnpm --filter sigil-chat-agent typecheck`,
  `pnpm --filter sigil-chat-gonk typecheck` — all clean.
- `pnpm --filter web exec vitest run` — 59 files / 243 tests passing.
- `pnpm --filter sigil-chat-agent exec vitest run` — 12 files / 62 tests
  passing.
- `pnpm --filter sigil-chat-gonk exec vitest run` — 10 files / 60 tests
  passing.
- `pnpm --filter web exec eslint` on every touched `apps/web` file — clean.
