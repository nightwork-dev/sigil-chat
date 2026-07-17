# Agent Multi-Session and Forking

> Date: 2026-07-16
> Status: Implemented MVP — **reviewed 2026-07-16 (maintainer review +
> implementation review): SHIP-WITH-FIXES.** Two defects must land before this
> is called done; findings below, amended per a second-lineage cross-model
> review (2026-07-16). Most claims verified directly against code and tests
> (both packages' suites pass; typecheck clean; store wiring, thread shape,
> switch-while-streaming guard, clean remount-by-key, per-thread draft
> isolation, and the bounded fork packet all confirmed).
> Runtime authority: Eve (the agent turn runtime role, per
> the ecosystem repository's `specs/sigil-chat-ecosystem-comparison-response.md`)
> Product persistence: Gonk Core store provider
> Related:
>
> - `AGENT-EMBEDDING-SPEC.md` (session provider mounted above router swaps)
> - `AGENT-CONTEXT-MANAGEMENT-SPEC.md` (thread-scoped drafts; see finding 6)
> - `AGENT-REACT-QUERY-STATE-SPEC.md` (client projection rules)

## Review findings (2026-07-16)

1. **HIGH — a failed turn discards retry state: one root failure, three
   affected states.** Eve's `EveAgentStore.send()` catches all turn errors
   internally, sets `status: "error"`, fires `onFinish`, and resolves
   normally (it rejects only on the already-processing guard). Everything
   sequenced after `await send(...)` therefore runs on failure too:
   - the pending **fork seed** is consumed (`handleSendSuccess` in
     `apps/web/src/components/agent-sessions.tsx` never inspects
     `session.status`), violating this spec's own "consume the pending seed
     only after the turn succeeds";
   - **turn-only attachments** and **attention exclusions** are cleared in
     `useAgentSession.send()`
     (`packages/agent/src/hooks/use-agent-session.ts`), violating the
     context contract's "clear turn-only draft attachments after confirmed
     submission" (`AGENT-CONTEXT-MANAGEMENT-SPEC` §11).
     A rate limit on a forked thread's first turn silently destroys the fork
     context AND the user's curated turn context, with no error surfaced and
     no retry path. Fix at the root: establish a real per-turn success signal
     (Eve resolves normally on failure, so `session.status` — or a
     turn-result value — must gate ALL post-send consumption), then add
     regression tests that fail the first turn and assert seed, attachments,
     and exclusions all survive.
2. **HIGH — revision conflict detection is dead code at every real call
   site, and the naive fix would trade silent clobbering for routine false
   conflicts.** The repository implements and unit-tests `expectedRevision`
   CAS, but `saveSnapshot`, `renameThread`, and `consumeForkSeed` in
   `agent-sessions.tsx` (~lines 136/186/192) never pass it, though
   `thread.revision` is in scope — two tabs last-write-wins clobber each
   other undetected. (The review workspace threads `expectedRevision`
   through consistently; the pattern was known.) However, simply passing the
   rendered `thread.revision` is NOT sufficient: each turn schedules
   persistence from both `onSessionChange` and `onFinish` (see finding 3),
   and both would carry the same rendered revision — the first write
   increments it and the second then conflicts on every normal turn. The
   fix must either chain a locally authoritative revision (updated from each
   mutation result before the next write) or collapse persistence to one
   write per turn before enabling expected revisions. Add a call-site-level
   conflict test AND a normal-turn no-false-conflict test.
3. **LOW — double persistence write per turn**: Eve fires both
   `onSessionChange` and `onFinish` at turn end and both are wired to
   `persistSnapshot`; collapse to one full write per turn.
4. **MEDIUM (design debt) — persistence contains more sensitive state than
   the events alone.** `saveSnapshot` structured-clones and rewrites the
   complete accumulated event stream on every save — unbounded, with
   tool-call payloads and approval decisions in plaintext — AND persists
   Eve's `SessionState` including continuation tokens. Tolerable for the
   explicitly local single-user MVP; a deployment blocker once
   authentication or multi-user ownership lands. Retention, redaction,
   access control, and token handling must cover both the event log and the
   session state, per the receipts discipline used everywhere else in the
   family.
5. **LOW (cosmetic)** — the four new `agent-threads*`/persistence modules
   use semicolons; surrounding app code is semicolon-free.
6. **Spec cross-reference** — the fork seed packet prepended to the first
   user turn is context the user cannot currently see. When the context
   tray (`AGENT-CONTEXT-MANAGEMENT-SPEC`) lands, the pending seed must
   surface as a visible context item (source: attachment,
   inclusion: automatic), not remain invisible prompt machinery.
7. **Trust model note** — threads are deployment-global until ownership
   lands (the spec says so under "Current limits"); the repo README's trust
   model section should state this plainly alongside the approval-header
   caveat.
8. **MEDIUM (inference — needs a trace) — forks of forks may re-ingest
   hidden fork packets as ordinary user text.** `prepareSend` prefixes the
   fork packet directly into the submitted message; `buildForkSeed` then
   derives the next fork from the persisted `eve.events`. If the prepared
   (packet-prefixed) message appears in those events as a message event, a
   second-generation fork carries the earlier hidden packet forward with
   muddy provenance. Size caps prevent unbounded growth, but visibility and
   provenance do not survive. Validate with a captured real fork-of-fork
   event trace; the durable fix is the same as finding 6 — the packet
   becomes a visible, provenance-carrying context item rather than message
   text.

   **Resolved by trace and derivation guard (2026-07-16).** The live trace in
   `FORK-OF-FORK-TRACE.json` confirms Eve persists the entire prepared message,
   including the hidden packet. `buildForkSeed` now removes the packet from a
   packet-prefixed `message.received` event while preserving the text after the
   `## New branch request` marker. A second-generation fork regression prevents
   the older packet from re-entering the next seed.

## Outcome and catalog follow-up review (2026-07-16)

1. **HIGH — resolved: outcome reconciliation was not runtime-routed by
   resource kind.** `reconcileAgentDomainOutcome` invalidated a review query
   for every value passed to it, using only `resource.id`. The current TypeScript
   union happens to contain only review outcomes, but this was unsafe at the
   browser event boundary and would silently misroute the first added domain
   outcome. The reconciler now rejects non-review or malformed outcomes before
   deduplication; the regression proves a graph outcome with the same resource
   id does not invalidate a review query.
2. **MEDIUM — resolved: the capability catalog could disclose host filesystem
   paths.** Eve inspection data was projected directly into the browser-visible
   `sourcePath`. Catalog projection now retains only normalized relative logical
   paths and drops absolute, drive-qualified, or parent-traversing paths.
3. **MEDIUM — open trust boundary: catalog access is application
   authorization.** The server function currently exposes the read-only Eve
   inspection projection to any caller admitted to the Sigil Chat application.
   That is acceptable only under the current local single-user trust model.
   Tool approval state must never be used to authorize catalog or session
   access; authenticated deployments need an application principal/ownership
   check at this server boundary. This is recorded in the README trust model
   under T7 rather than papered over with a UI permission.
4. **LOW — open extraction debt: Eve projection remains product-local.** The
   hard-coded default Eve origin and Eve inspection shape move to
   `sigil-agent/packages/eve` under T18. The current screen is an honest
   read-only projection, not the managed Gonk skill registry promised by the
   longer-term skill-management spec.

## Decision

Sigil Chat supports multiple named agent conversations.

- Eve owns durable execution, conversation history, continuation tokens, and
  replayable event streams.
- Sigil Chat owns thread titles, active selection, archive state, fork
  provenance, and the UI read model.
- Gonk Core owns the scoped persistence adapter through `@gonk/scope` and
  `@gonk/store`.
- The store uses Gonk's `mirkBackendFactory`; Sigil Chat does not import Mirk
  directly or construct a database path.

The project tier is used. Gonk's session tier represents harness scope and is
not an Eve conversation identifier.

## Thread record

```ts
interface AgentThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "archived";
  revision: number;
  eve: {
    session: SessionState;
    events: HandleMessageStreamEvent[];
  };
  forkedFrom?: string;
  forkSeed?: AgentThreadForkSeed;
}
```

`SessionState` is a resumable cursor, not a transcript. The copied event list is
a product read model; Eve's durable stream remains authoritative.

## UX

The Agent HUD and full chat share the active thread.

Inline header controls provide:

- active-thread selection;
- new conversation;
- semantic fork.

Switching is disabled while the active turn is streaming in the MVP. This
avoids disconnecting the only mounted React runtime mid-turn. A later
background-runtime pool may keep several busy sessions mounted concurrently.

Creating a conversation does not call Eve `reset()`. It creates another
persistent application thread with a fresh `{ streamIndex: 0 }` cursor.

Thread-scoped context drafts are isolated by application thread. Session
attachments survive route changes and turns inside that thread, but do not leak
into another thread.

## Persistence

The long-lived server repository uses:

```ts
const scope = createScope({ cwd: process.cwd() });
const store = createStoreProvider(scope, {
  backendFactory: mirkBackendFactory(scope),
});
```

Namespaces:

- `sigil-chat.agent-threads.v1`;
- `sigil-chat.agent-thread-preferences.v1`.

React Query owns the browser projection and mutation reconciliation. Eve
lifecycle callbacks persist the latest cursor and complete event snapshot.

## Forking contract

Eve 0.24.4 has no clone/fork route. Copying a continuation token would create
two clients competing for the same conversation, not two branches.

Sigil therefore implements a semantic fork:

1. create a fresh thread and Eve cursor;
2. record `forkedFrom`;
3. derive a bounded packet from persisted user and assistant messages;
4. prepend that packet to the first user turn in the new thread;
5. consume the pending seed only after the turn succeeds.

The UI and agent must not claim that hidden reasoning, tool state, approvals, or
exact role history were cloned.

## Current limits

- No background simultaneous streaming after switching threads.
- No exact role-faithful Eve history injection.
- No multi-process compare-and-set in the current Gonk KV contract.
- Rename and archive domain operations exist; richer management UI is later.
- Ownership must be added when authenticated multi-user access lands.

## Retention and redaction decision

`AGENT-SESSION-RETENTION-ISSUE.md` is the implementation contract. The product
snapshot is capped at 1,000 sanitized events and 2 MiB, carries an explicit
compaction receipt, drops reasoning, strips tool payloads and approval decisions,
and treats the continuation token as a server-only owner-scoped secret. The
current raw snapshot remains a documented local-development exception and a
multi-user deployment blocker until those implementation checks pass.

## Auth migration note

Session ownership is application authorization. The upcoming Gonk MCP package
also removes the top-level transport `authorize` callback; tool approval tiers
move to the registry `ApprovalProvider`. These are related policy boundaries,
but session catalog access must not be inferred from tool approval state.
