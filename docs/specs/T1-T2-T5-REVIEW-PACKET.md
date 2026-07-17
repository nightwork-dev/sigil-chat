# T1 / T2 / T5 independent review packet

> Prepared: 2026-07-16
> Review owner: David-managed independent cross-model lane
> Implementing branch: `codex/sigil-chat`

This packet is intentionally narrow. It asks the reviewer to decide whether the
three correctness claims below are proved by the implementation and by tests
that fail when the relevant protection is reverted.

## T1 — failed turns preserve pending state

Claim: a normally-resolved Eve turn whose final status is `error` is converted
to a failed send before any success-only consumer runs. A fork seed, turn-only
attachments, and attention exclusions therefore survive the failure and are
consumed exactly once by a later successful retry.

Primary evidence:

- `apps/web/src/hooks/use-app-agent-session.ts`
- `apps/web/src/components/use-app-agent-session.test.ts`
- `apps/web/src/components/agent-sessions.tsx`
- `apps/web/src/components/agent-sessions.test.ts`
- commit `38719f5` (`fix(agent): preserve turns and chain thread revisions`)

The original donor hook and integration test were removed during the released
package cutover. The live-host regression now exercises the current
`@niwork/agent` composition directly: a failed result retains turn attachments
and exclusions, while a succeeded result clears them.

Current negative control (2026-07-17): temporarily removing the
`result.status === "succeeded"` guard made the failed-turn regression fail with
an empty attachment list. Restoring the guard returned the focused suite to
green.

The earlier donor negative controls remain recorded in `EXECUTION-TASKS.md`:
removing failed-turn rejection ran success-only cleanup, and allowing a second
send during deferred post-turn persistence failed the re-entrancy regression.

## T2 — one authoritative revision chain

Claim: one successful turn performs one snapshot write, then advances the
authoritative revision returned by each mutation through fork-seed consumption
and rename. A competing writer surfaces a conflict; a normal chain does not
produce a false conflict.

Primary evidence:

- `apps/web/src/components/agent-sessions.tsx`
- `apps/web/src/lib/agent-session-persistence.ts`
- `apps/web/src/components/agent-sessions.test.ts`
- `apps/web/src/lib/agent-session-persistence.test.ts`
- commit `38719f5`

Negative controls already recorded in `EXECUTION-TASKS.md`: restoring the
second persistence path fails the single-write assertion; stopping revision
advancement fails the normal snapshot -> seed -> rename path at seed
consumption.

## T5 — fork packets never become authored history

Claim: Eve persists the complete prepared first message, including the hidden
fork packet. Second-generation fork derivation removes that packet and retains
only the visible text following `## New branch request`.

Primary evidence:

- `apps/web/src/lib/agent-threads-domain.ts`
- `apps/web/src/lib/agent-threads-domain.test.ts`
- `docs/specs/FORK-OF-FORK-TRACE.json`
- commit `38719f5`

The captured trace establishes the failure precondition. The regression proves
that a fork of that persisted message does not recursively ingest the hidden
packet as authored text.

## Fresh integrated verification

On 2026-07-16, after consuming the released authenticated Gonk adapter:

- recursive tests passed across the workspace;
- recursive typecheck passed across all participating projects; and
- the Sigil Chat production build completed successfully.

The independent reviewer should record `APPROVE` or severity-ranked findings in
`EXECUTION-TASKS.md`. T1, T2, and T5 remain `in-review` until that happens.
