# Agent session retention, redaction, and resume-secret issue

> Date: 2026-07-16
> Status: decision accepted; product projection implemented; deployment gates open
> **Revised 2026-07-20 (owner decision): retention v2 — action payload
> redaction reversed.** Tool/action inputs and outputs, approval prompts and
> options, and subagent outputs now persist verbatim (JSON, bounded at 64 KiB
> per payload with an explicit truncation marker). Rationale: blanket redaction
> made every rich tool rendering collapse to an empty badge after reload, which
> read as data loss. The secret-bearing families below (reasoning,
> authorization challenges, continuation tokens, file part URLs) remain
> dropped. Narrowed per-tool-family redaction is a roadmap item (RET.1) to
> revisit with the ownership work. The "Redaction" section below documents v1
> and is retained for provenance; `agent-event-retention.ts` is authoritative.
> Owner: Sigil Chat product persistence boundary
> Related: `AGENT-MULTI-SESSION-SPEC.md`, execution task T6

## Problem

Sigil Chat currently rewrites the complete Eve event projection and
`SessionState` on every finished turn. The event array is unbounded and may
contain reasoning, tool inputs/outputs, approval prompts or decisions, and
authorization details. `SessionState.continuationToken` is a bearer-like resume
secret. The current Gonk-backed record is deployment-global and is returned to
the browser without an owner check.

This is acceptable only for the explicitly local single-user development app.
It is a deployment blocker, not a future polish item.

## Decision

### Product event projection

Persisted `eve.events` is a bounded product read model, never Eve's canonical
conversation history.

- Policy version: `sigil-chat-event-retention-v1`.
- Retain at most 1,000 sanitized events and at most 2 MiB of serialized event
  data per thread, whichever limit is reached first.
- Apply the byte limit from newest to oldest without splitting an event.
- Persist a compaction receipt containing the policy version, first retained
  stream index, omitted event count, and compaction timestamp.
- Do not invent a transcript summary during compaction. A future summary may be
  added only as a separately identified derived artifact with provenance.

### Redaction

- Drop `reasoning.appended` and `reasoning.completed` from the product snapshot.
- Preserve user and assistant message text because it is the visible transcript.
- For tool/action events, retain only event type, tool/call identity, lifecycle
  status, timing, and redaction marker. Remove input and output payloads.
- For input/approval events, retain only request identity, display kind, and
  lifecycle status. Remove prompt text, options, freeform responses, and the
  approval decision itself.
- Drop authorization challenges, URLs, user codes, bearer material, and callback
  tokens. Retain only connection identity and terminal outcome when needed for
  visible status.
- Redaction happens before persistence and before React Query cache insertion;
  the browser must not receive the sensitive form and then hide it visually.

### Session state and continuation tokens

- `sessionId` and `streamIndex` may remain in the owner-scoped thread record.
- `continuationToken` is a secret and must not appear in thread list responses,
  logs, traces, cache keys, or general event receipts.
- In an authenticated deployment, store the continuation token through a
  server-only secret adapter and exchange it for an owner-scoped resume
  operation. The browser receives only the minimum ephemeral value required by
  the Eve client after the owner check.
- Rotating or consuming a continuation token must update the secret and snapshot
  revision atomically. Until Gonk/Mirk proves that CAS/transaction boundary,
  multi-process deployment remains blocked.

### Ownership and deletion

- Every thread, snapshot, compaction receipt, and resume secret is keyed by the
  authenticated application principal plus thread id.
- List/get/mutate/resume operations enforce that owner. Tool consent state never
  grants catalog or session access.
- Archive is not deletion. A hard-delete operation must remove the thread read
  model, resume secret, and derived receipts, while Eve's own retention remains
  governed by Eve.

## Implementation issue

1. **Implemented, uncommitted:** add a pure event sanitizer/bounder with fixture
   coverage for retained, redacted, dropped, bounded, and replayed event
   families.
2. **Partially implemented, uncommitted:** the thread snapshot now stores the
   closed product event projection and compaction receipt. Thread-list responses
   are token-free summaries, and hard delete removes the product read model.
   Replacing the raw continuation token with a server-only secret reference is
   still blocked on the adapter and atomicity work below.
3. Add principal ownership to the repository and every server function.
4. Add a server-only continuation-token adapter with atomic revision tests.
5. **Partially implemented, uncommitted:** unit and repository regressions prove
   list snapshots and retained/replayed events contain no continuation token,
   tool payload, approval prompt or decision, authorization challenge, or
   reasoning text. A production-adapter browser proof remains open with items
   3–4.
6. Remove the local-only deployment caveat only after the full suite passes
   against the production persistence adapter.

Items 3, 4, and the remaining part of 5 are not safely implementable in Sigil
Chat alone. The TanStack application routes do not yet receive an authenticated
application principal, and the published Gonk store surface does not expose the
CAS/transaction boundary required to rotate a resume secret and snapshot
revision atomically. The local-only caveat therefore remains authoritative.
