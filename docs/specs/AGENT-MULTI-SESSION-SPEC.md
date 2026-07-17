# Agent Multi-Session and Forking

> Date: 2026-07-16
> Status: Implemented (2026-07-17). Reviewed 2026-07-16 (maintainer +
> implementation review, amended per a second-lineage cross-model pass);
> the two blocking defects were fixed and passed independent cross-model
> review closure 2026-07-17. Store wiring, thread shape,
> switch-while-streaming guard, clean remount-by-key, per-thread draft
> isolation, and the bounded fork packet are all verified by tests.
> Runtime authority: Eve (the agent turn runtime role, per
> the ecosystem repository's `specs/sigil-chat-ecosystem-comparison-response.md`)
> Product persistence: Gonk Core store provider
> Related:
>
> - `AGENT-EMBEDDING-SPEC.md` (session provider mounted above router swaps)
> - `AGENT-CONTEXT-MANAGEMENT-SPEC.md` (provenance note; thread-scoped
>   drafts now specified in the sigil-agent repository's
>   `docs/specs/CONTEXT-CONSUMER-PROFILE.md`)
> - `AGENT-REACT-QUERY-STATE-SPEC.md` (client projection rules)

## Implementation constraints

Durable requirements established by review and now enforced by regression
tests:

- **Post-send consumption must be gated on real turn success.** Eve's
  `send()` resolves normally even when a turn ends in `status: "error"` (it
  rejects only on the already-processing guard), so nothing downstream may
  assume a resolved promise means success. The pending fork seed,
  turn-only attachments, and attention exclusions are consumed only after
  an explicit per-turn success signal (`session.status`, or an equivalent
  turn-result value) — never unconditionally after `await send(...)`.
- **Persistence writes must use a locally authoritative revision, and one
  write per turn.** `saveSnapshot`, `renameThread`, and `consumeForkSeed`
  pass `expectedRevision` CAS on every call. Because a turn schedules at
  most one persistence write (Eve's `onSessionChange` and `onFinish` are
  collapsed to a single `persistSnapshot` call), the revision used for CAS
  is chained from each mutation result before the next write, not reused
  from the rendered thread across multiple writes in the same turn.
- **Fork-of-fork derivation must strip hidden packets.** `prepareSend`
  prefixes the fork packet into the submitted message, and Eve persists
  that full prepared text as a `message.received` event. `buildForkSeed`
  removes the packet from a packet-prefixed event before deriving the next
  fork's seed, preserving only the text after the `## New branch request`
  marker — verified against a captured production fork-of-fork trace
  (retained locally as evidence, not part of the public spec tree) and
  guarded by a second-generation-fork regression test.
- **The fork seed must eventually become visible context**, not remain
  invisible prompt machinery: when a context tray ships (see
  `AGENT-CONTEXT-MANAGEMENT-SPEC.md`'s successor,
  `CONTEXT-CONSUMER-PROFILE.md`), the pending seed must surface as a
  visible context item (source: attachment, inclusion: automatic).
- **Outcome reconciliation must reject unrecognized resource kinds before
  deduplication.** `reconcileAgentDomainOutcome` only invalidates queries
  for outcome kinds it recognizes; a malformed or non-review outcome must
  not silently misroute into an unrelated query invalidation just because
  it shares a `resource.id`.
- **The capability catalog must never disclose host filesystem paths.**
  Eve inspection data is projected into `sourcePath` as a normalized
  relative logical path only; absolute, drive-qualified, or
  parent-traversing paths are dropped before the browser sees them.
- **Tool approval state must never authorize catalog or session access.**
  Catalog access is application authorization, currently granted to any
  caller admitted to the Sigil Chat application under the local
  single-user trust model; an authenticated deployment needs an
  application principal/ownership check at this server boundary before
  that trust model can be lifted (see "Current limits" below).
- **Eve projection remains product-local, by design for now.** The
  hard-coded default Eve origin and Eve inspection shape are extraction
  debt: they belong in `sigil-agent/packages/eve` once that package takes
  over catalog projection, not the managed Gonk skill registry the
  longer-term skill-management spec describes.

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
