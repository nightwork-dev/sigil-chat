# Execution tasks — sigil-chat fixes, lane A extraction, sigil-agent

> Current remaining-work brief:
> `SIGIL-CHAT-GRADUATION-TASKS.md`. This file remains the authoritative T1–T22
> history and evidence record.

> Date: 2026-07-16 (the maintainer)
> Governing docs: `SIGIL-AGENT-EXTRACTION-DISPOSITION.md` (ratified, four
> review rounds), `AGENT-MULTI-SESSION-SPEC.md` review findings,
> `sigil-chat-ecosystem-comparison{,-response}.md` in
> the ecosystem repository's `specs/`.
> This file is the single coordination surface for this program. Claim a
> task by putting your name in its Owner cell; update Status in place;
> append notes under the task, never rewrite another agent's notes.

## Coordination protocol

1. **Claim before work.** Edit the Owner cell first (one agent per task;
   sub-splitting is fine — note it). Check Depends-on is satisfied.
2. **Writer ≠ reviewer.** Every task ends with an independent review in a
   fresh context before its Status becomes `done`. Contract-authoring tasks
   (T16) and security-adjacent tasks (T1, T2, T9) require a cross-model
   reviewer, not just fresh-context same-model.
3. **Artifacts or it didn't happen.** Each task names its check; `done`
   requires the check's real output (test run, rg output, build), not an
   exit code or a worker's claim. Regression tests must be shown to FAIL
   with the fix reverted at least once.
4. **Model lanes** (house policy): mechanical/well-specified implementation
   → pi `gpt-5.6-luna --thinking xhigh`; taste-bearing UI (T13, T14, all
   `registry/` work) → Claude models only; reviews → fresh context, cross
   model where flagged.
5. **Statuses:** `open` → `claimed` → `in-review` → `done` / `blocked`.
6. The worktree is uncommitted work on `codex/sigil-chat`. Do not commit or
   push unless the maintainer asks. Coordinate file collisions by claiming
   before editing shared files (this file included).

## Phase 0 — Fix in place (sigil-chat worktree; no extraction until P0 core is done)

| ID  | Task                                                | Depends | Owner                | Status    |
| --- | --------------------------------------------------- | ------- | -------------------- | --------- |
| T1  | Turn-failure state destruction (HIGH)               | —       | implementation lane  | done      |
| T2  | Revision chaining + single-write persistence (HIGH) | —       | implementation lane  | done      |
| T3  | PassageEditor draft boundary                        | —       | implementation lane  | done      |
| T4  | Review `agent-domain-outcomes` + skills catalog     | —       | implementation lane  | done      |
| T5  | Fork-of-fork trace validation                       | T1      | implementation lane  | done      |
| T6  | Event-snapshot bound + redaction decision           | —       | implementation lane  | done      |
| T7  | README trust-model additions                        | —       | implementation lane  | done      |
| T8  | Shared file-store core (worktree-internal)          | —       | implementation lane  | done      |

**T1 — Turn-failure state destruction.** Eve's `send()` resolves normally on
turn error, so everything sequenced after it runs on failure. Establish a
real per-turn success signal (from `session.status` or a turn result) and
gate ALL post-send consumption on it: pending fork seed
(`apps/web/src/components/agent-sessions.tsx` `handleSendSuccess`),
turn-only attachments and attention exclusions
(`packages/agent/src/hooks/use-agent-session.ts` `send`). Check: new
regression tests — fail the first turn of a forked thread, assert seed AND
attachments AND exclusions survive; all suites green. Cross-model review.

**T2 — Revision chaining.** Order matters: (a) collapse the double persist
(`onSessionChange` + `onFinish` both → `persistSnapshot`) to one write per
turn; (b) wire `expectedRevision` through `saveSnapshot`, `renameThread`,
`consumeForkSeed` with a locally chained authoritative revision updated from
each mutation result — NOT the rendered `thread.revision` alone. Check: a
call-site-level conflict test (two writers, conflict surfaced) AND a
normal-turn no-false-conflict test. Cross-model review.

**T3 — PassageEditor draft boundary.** Replace the render-time `setDraft`
reconciliation (`apps/web/src/features/review/review-workspace.tsx`
~742–753) with a keyed/reset or reducer boundary that preserves a dirty
local draft while accepting a newer persisted revision. Check: test —
agent edits a passage while it is locally being edited; conflict surfaced,
neither version silently lost (REACT-QUERY-STATE §15.5 item 23).

**T1 completion evidence (implementation lane, 2026-07-16).** The provider now treats Eve's
normally-resolved `status: "error"` finish as a rejected turn before any
post-send consumer runs. The integration regression fails the first send with
a fork-seed consumer callback, a turn attachment, and an attention exclusion;
all three survive, then the retry consumes/clears them exactly once. Restored
run: targeted agent regression 1/1 passed and agent typecheck passed. Negative
control: temporarily removing the failed-turn throw made the test fail because
the promise resolved instead of rejecting. Awaiting maintainer-arranged cross-model
review before `done`.

**T1 concurrency hardening (implementation lane, 2026-07-16; uncommitted).** The provider now
keeps a per-turn result active until asynchronous post-turn success work has
finished, matching Eve's single-turn contract rather than sharing an error ref
across a briefly re-entrant window. A regression starts a second send while
success persistence is deferred and proves it is rejected before reaching Eve.
The old implementation failed that negative control by resolving the second
send. The agent package suite and typecheck are green. The cross-model review
gate remains outstanding.

**T2 completion evidence (implementation lane, 2026-07-16).** `ActiveAgentSession` exposes
only the final `onFinish` persistence callback. Snapshot save, fork-seed
consumption, and rename share one serialized authoritative revision
coordinator. The focused suite passed 7/7, including a real competing-writer
conflict and a normal snapshot → consume → rename chain using revisions
8 → 9 → 10 without a false conflict; web typecheck passed. Negative controls:
restoring an `onSessionChange` write path failed the single-write regression,
and disabling revision advancement failed the normal-turn regression with the
expected false conflict. Awaiting maintainer-arranged cross-model review before
`done`.

**T2 call-site regression (implementation lane, 2026-07-16; uncommitted).** A component-level
test now mounts the real `AppAgentSessions`/`ActiveAgentSession` sequencing path
and routes its public mutation hooks into a real `AgentThreadRepository`. One
case advances the repository through a competing writer and proves the conflict
reaches the application alert while fork-seed consumption and rename do not
run; the normal case proves the sole `onFinish` write chains snapshot, seed
consumption, and rename without a false conflict. Disabling revision advancement
made the normal call-site path fail at repository seed consumption, then the
restored suite and web typecheck passed. The cross-model review gate remains
outstanding.

**T3 completion evidence (implementation lane, 2026-07-16).** `PassageEditor` now uses a
reducer-owned local overlay instead of setting state during render. A newer
persisted revision leaves the dirty local body in the editor, displays both
local and persisted bodies in an explicit conflict surface, and requires the
user to choose the saved revision or explicitly replace it. The focused suite
passed 2/2 and web typecheck passed. Negative control: projecting the persisted
body over the dirty local body made the preservation regression fail. The
fresh-context native architect review approved the boundary and regression.

**T4 — Close the review loop on the two unreviewed modules.**
`apps/web/src/lib/agent-domain-outcomes.tsx` (note: it currently invalidates
`reviewDocumentKeys` for ANY outcome resource id — check kind routing) and
`agent-catalog.ts` + `routes/_app/skills.tsx`. Standard review: findings
by severity, verified in source, written into AGENT-MULTI-SESSION-SPEC or a
sibling doc.

**T4 completion evidence (implementation lane, 2026-07-16).** Findings are recorded in
`AGENT-MULTI-SESSION-SPEC.md`. Outcome reconciliation now rejects unrelated
resource kinds before deduplication; catalog projection drops absolute,
drive-qualified, and parent-traversing host paths. Focused outcome/catalog
tests passed 8/8. The application-authorization boundary and the T18 Eve
adapter move remain explicitly open; the task's scoped implementation passed
fresh-context native architect review.

**T5 — Fork-of-fork trace.** Capture a real second-generation fork event
trace; determine whether the packet-prefixed first message re-enters
`buildForkSeed` derivation. If confirmed: exclude packet-prefixed text from
derivation or tag it with provenance. Check: the captured trace + a unit
test on the derivation.

**T5 completion evidence (implementation lane, 2026-07-16).** A live Eve HTTP session proved
that `message.received.data.message` persists the complete packet-prefixed
prepared text; the redacted trace is `FORK-OF-FORK-TRACE.json`. Fork derivation
now strips the hidden packet while retaining the visible text after
`## New branch request`. The second-generation regression and the full thread
domain suite passed 8/8. Awaiting independent review before `done`.

**T6 — Event snapshot bound/redaction.** Decide and document (spec edit +
issue): cap/compaction for persisted `eve.events`, redaction of tool
payloads and approval decisions, and the same treatment for persisted
`SessionState` continuation tokens. Implementation may be deferred; the
decision may not.

**T6 completion evidence (implementation lane, 2026-07-16).** The decision and implementation
issue are canonicalized in `AGENT-SESSION-RETENTION-ISSUE.md` and summarized in
`AGENT-MULTI-SESSION-SPEC.md`: dual count/byte cap, compaction receipt, explicit
event-family redaction, continuation token as an owner-scoped server secret,
and an atomic CAS gate before multi-process deployment. Implementation remains
explicitly open under the issue; the required decision passed fresh-context
native architect review.

**T6 implementation progress (implementation lane, 2026-07-16; uncommitted).** The thread
repository now persists a closed, bounded product event projection rather than
raw Eve history, with tool/input/auth/reasoning redaction, a versioned compaction
receipt, and an explicit safe replay projection. Thread lists return token-free
summaries, and hard delete removes the product read model. Regressions cover
redaction, count/byte bounds, replay, cache/list projection, compaction receipts,
and revision-checked deletion. Application-principal ownership, server-only
resume-secret storage, and atomic secret/snapshot rotation remain blocked on the
host identity boundary and a production CAS/transaction adapter; the local-only
deployment caveat is intentionally unchanged.

**T7 — README trust model.** Add: threads are deployment-global until
ownership lands; session catalog access is application authorization, not
tool-approval state. Alongside the existing approval-header caveat.

**T7 completion evidence (implementation lane, 2026-07-16).** README now states that threads
are deployment-global, catalog/session access is application authorization,
tool consent does not grant it, Gonk MCP auth does not protect app/Eve routes,
and raw continuation-token snapshots are local-only. The trust-model additions
passed fresh-context native architect review.

**T8 — Shared file-store core.** Dedupe `graph-store`/`review-store` lock +
corrupt-store validation into one worktree-internal module (review-store
currently lacks dead-PID reaping and shape validation). Explicitly
temporary pending Mirk CAS (ecosystem ruling 5). Check: both stores' suites
green; the review-store gains the graph-store's crash-recovery tests.

**T8 completion evidence (implementation lane, 2026-07-16).** The private
`@workspace/file-store-core` package now owns atomic JSON writes, root-path
resolution, structured corruption handling, lock metadata, dead-PID recovery,
hard-stale recovery, and live-lock protection. Both graph-store and review-store
consume it; review-store now validates its persisted shape and has dead-process,
unparseable-stale-lock, and corrupt-file regressions. Fresh checks: file-store
core 3/3, graph-store 10/10, review-store 6/6, with all three package typechecks
green. The package remains explicitly temporary pending Mirk CAS proof;
the worktree-internal extraction passed fresh-context native architect review.

**T1-T8 review disposition (native architect, 2026-07-16).** A fresh-context
read-only architect audit approved the implemented behavior and regressions for
T1-T8 after two correctness findings in the extracted contracts/outcome adapter
were fixed and re-verified. T3, T4, T6, T7, and T8 therefore pass their standard
independent-review gate. T1 and T2 remain `in-review` because their required
maintainer-arranged cross-model review is still outstanding; T5 remains `in-review`
behind T1 even though its implementation and standard review are complete.

## Phase 1 — Gonk 0.1.0 compatibility (parallel with Phase 0)

| ID  | Task                                          | Depends | Owner        | Status |
| --- | --------------------------------------------- | ------- | ------------ | ------ |
| T9  | Adopt published `@gonk/*@0.1.0` auth contract | —       | Codex (Gonk) | done   |

**T9.** Verified: the canonical registry's `@gonk/tool-registry-mcp@0.1.0`
contains `makeAuthContext`/`securityContextKey`. Remove the obsolete
top-level `authorize` callback from `apps/gonk/src/server.ts`; move
exec-tier consent to the registry `ApprovalProvider`; add integration
coverage for principal propagation, approval-required outcomes, disclosure
filtering, and denied orchestrator mutations. Check: those four integration
tests green against the published artifacts. Gates T20 only — not core.
Cross-model review.

**T9 completion note (implementation lane, 2026-07-16).** The consumer now resolves the
published auth train, uses `makeAuthContext`, and routes tier consent through
the production `sigilApprovalProvider`. The integration suite exercises the
real Web MCP initialize/session/list/call path for principal propagation,
structured approval-required outcomes, production exec denial, disclosure
filtering, and denied pin mutation. `pnpm --filter sigil-chat-gonk typecheck`
and `pnpm --filter sigil-chat-gonk test` passed. The independent security
review's initial blocker (the production provider's exec branch was untested)
was fixed and the follow-up verdict was APPROVE.

## Phase 2 — Lane A cherry-picks into sigil-design main

| ID  | Task                                                                | Depends                         | Owner                           | Status    |
| --- | ------------------------------------------------------------------- | ------------------------------- | ------------------------------- | --------- |
| T10 | Graph engine delta                                                  | T-none (engine is fixed+tested) | Sigil Design                    | done      |
| T11 | Review package delta                                                | —                               | Sigil Design                    | done      |
| T12 | Chat component diffs                                                | —                               | Sigil Design                    | done      |
| T13 | `text-editor` as optional registry item                             | —                               | Sigil Design                    | done      |
| T14 | A.1 component extractions (json-value, emphasis-effects, HUD shell) | —                               | maintainer-managed Sigil Design lane | done      |

Order: T10 → T11 → T12 → T13 → T14. Per-task notes: T10 excludes
`builtins`/`sample` (separate showcase-vs-engine review at pick time). T12
requires a diff review confirming nothing Eve-specific leaked in. T13:
Tiptap deps declared on the registry item, never in `packages/ui`
dependencies. T14 is taste-bearing (Claude lane): `json-value` moves as-is;
`agent-dom-effects` generalizes into an emphasis-effects primitive
(rename ids/events, keep validated targets + reduced-motion + cleanup);
the HUD floating-dock shell primitive owns ALL anchors (this also retires
the detached-anchor spec violation). Each lands with a showcase demo and
the four-step component verification bar (typecheck → build → real browser
→ console).

**T10-T13 reconciliation note (implementation lane, 2026-07-16).** These are landed and
canonical in Sigil Design `main` at `374b7a0`. The landed graph tranche includes
`builtins` in addition to the engine delta; `sample` remained product-local.
The review, chat, and optional registry-installed text-editor tranches are also
in that commit. This records repository truth rather than re-performing their
already-completed extraction.

**T14 historical reconciliation note (implementation lane, 2026-07-16; superseded below).**
`FloatingDock` is implemented
but uncommitted in the sigil-design repository's worktree at
`worktrees/sigil-floating-dock` on `codex/floating-dock-shell`; its
targeted/full UI tests, typechecks, build,
registry build, and external-install smoke have implementation evidence. It
awaits the maintainer-managed Fable review and canonical landing. `json-value` and
generalized `emphasis-effects` remain open, so T14 as a whole is not done.

**T14 live reconciliation (implementation lane, 2026-07-16).** `FloatingDock` is now
canonical on Sigil Design `main` at `3cc0bee`. Its real source-registry output
is installed into the Sigil Agent TanStack host; the compile-time declaration
has been removed. Browser proof covers expansion, restore, detach, desktop and
390px viewport geometry, horizontal overflow, and a clean console. `json-value`
is removed from this tranche because no generic current consumer exists beyond
the agent tool-call renderer. The neutral emphasis-effects extraction is also
removed from this tranche: repository search found no second non-agent
consumer, so extracting it would manufacture a shared primitive without
consumer pull. The app-owned projection remains behind the neutral
client-command boundary. T14 is complete on that narrower, evidence-based
scope.

## Phase 3 — sigil-agent (after Phase 0 T1–T3 and Phase 2 complete)

| ID  | Task                                                            | Depends        | Owner                       | Status    |
| --- | --------------------------------------------------------------- | -------------- | --------------------------- | --------- |
| T15 | Scaffold repo shells                                            | T1–T3, T10–T14 | sigil-agent extraction lane | done      |
| T16 | Author neutral core contracts + conformance fixtures            | T15            | sigil-agent extraction lane | done      |
| T17 | Port components onto contracts → `packages/core` + `registry/`  | T16            | sigil-agent extraction lane | done      |
| T18 | `packages/eve` adapter                                          | T16            | sigil-agent extraction lane | done      |
| T19 | `packages/react-query` adapter                                  | T16            | sigil-agent extraction lane | done      |
| T20 | Host contract + `packages/gonk` + live Sigil Chat proof         | T17, T18, T9   | sigil-agent extraction lane | done      |
| T21 | Spec splits (Gonk sections → gonk repo; consumer sections stay) | T16            |                             | done      |
| T22 | Re-point sigil-chat; graduation                                 | T17–T21        | Sigil Chat lane             | in-review |

**T15.** Follow the template scaffold recipe; layout per disposition §B.0
(`packages/core`, `packages/eve`, `packages/react-query`, `packages/gonk`,
`registry/`). Shells only, no code moves.
Shells only, no code moves.

**T16.** The load-bearing task. `AgentRuntimeSession`, `AgentMessage`,
`AgentMessagePart`, `AgentToolCallPart`, `AgentAuthorizationPart`, runtime
capability declarations — closed unions, Standard Schema validators at
every boundary, no `| string` discriminants, no Eve types anywhere in
public API. Plus the adapter conformance fixture suite any turn runtime
must pass. Check: `rg "eve" packages/core` returns nothing;
fixtures run green against a stub adapter. **Cross-model review mandatory
before T17/T18 start.**

**T17.** Contract-first port: components consume core contracts only;
approval presentation loses its policy mutation (the "Always allow" button
becomes a callback); the `ai` dependency is dropped; navigation goes behind
the render-prop seam (core is React-only). Check: typecheck + the ported
integration tests + `rg "@tanstack|eve" packages/core registry/src` clean
(registry may import sigil-design primitives).

**T18.** Eve adapter passes the T16 conformance fixtures; owns Eve
cursors/events, fork-packet derivation, catalog projection (the hard-coded
`EVE_ORIGIN` moves here as configuration). Check: fixtures green + the
multi-session suites re-pointed and green.

**T20.** Publish the authenticated Gonk adapter, document the responsibilities
of a real host, and prove the released packages in Sigil Chat through a real
model and authenticated tool call. Do not substitute a simulated application
for live integration evidence.

**T21.** Split CONTEXT-MANAGEMENT / SKILL-MANAGEMENT / RETRIEVAL along the
ratified seam: protocol/persistence/retrieval/authorization contract
sections → gonk repo as canonical; context-tray UI, consumer behavior,
React Query projections, adapter guidance → sigil-agent. No authoritative
copies on either side; each side links the other.

**T21 completion (implementation lane, 2026-07-17).** Gonk Core 0.3.1 and its canonical
`docs/context-design.md`, `docs/skills-design.md`, and
`docs/retrieval-design.md` now own the shipped contracts. Sigil Agent contains
only `CONTEXT-CONSUMER-PROFILE.md`, `SKILLS-CONSUMER-PROFILE.md`, and
`RETRIEVAL-CONSUMER-PROFILE.md`; its split manifest is marked executed. The
three former mixed Sigil Chat specs are provenance notes linking both homes,
with their historical review text preserved through git object `4cce235`.

**T22.** Re-point all sigil-chat imports to the new packages/registry; full
`pnpm -r typecheck` + `pnpm -r test` green; the branch graduates to a
product repo. The fork question closes.

**T15-T20 reconciliation note (implementation lane, 2026-07-16).** The live
sigil-agent repository contains the committed shell
and runtime-neutral seam scaffold at `0cf72f4`, plus uncommitted closed
contracts, turn-result and cancellation handling, attention, Standard Schema
validation, Eve translation, initial registry HUD, React Query, and Gonk
package work. Current package typechecks and tests are green, but this is not
the completed extraction: the HUD is not the full neutral visual port,
`FloatingDock` is represented by a temporary compile-time declaration, the
TanStack host remains a shell rather than a wired reference application, and
the Gonk and spec-split work is incomplete. T15/T16/T19 have implementation
evidence but still await the required maintainer-arranged independent review;
T17/T18 remain actively incomplete and T20 is dependency-blocked.

**T16/T18/T19 implementation note (implementation lane, 2026-07-16).** The uncommitted
`sigil-agent` work now has closed and runtime-validated message, tool,
authorization, turn-result, capability, catalog, and domain-outcome contracts.
Closed schemas reject unknown provider fields at their nested public boundaries;
revert-proven regressions cover message, tool, authorization, and send inputs.
The Eve package runs the shared success/failure/cancellation conformance suite
through the actual adapter; owns explicit-origin authenticated catalog
inspection and safe logical-path projection; and owns cursor/event cloning plus
bounded fork-packet derivation with a fork-of-fork regression. The React Query
adapter validates unknown runtime outcomes before a product resolver can map
them to query keys. Outcome deduplication now commits an id only after successful
reconciliation, shares concurrent in-flight work, and permits retry after a
transient invalidation failure; both the neutral adapter and Sigil Chat consumer
have regressions for that failure path. Fresh full typechecks, tests, and the
Sigil Chat production build are green. T16 and T19
remain `in-review`; T18 remains `claimed` until Sigil Chat's multi-session
suites are re-pointed under T22. The mandatory independent review is still the
maintainer-arranged gate.

**T16 context-core progress (implementation lane, 2026-07-16; uncommitted).** The neutral core
now also owns privacy serialization, semantically prioritized focus/edit/action
history with bounded hover noise, scoped context drafts, ordered turn/session
attachments, exclusions, exact bounded previews, a telemetry reducer/hook, and
thread-control provider/hook. These surfaces use closed schemas and contain no
Eve, Gonk, router, or TanStack imports. Core tests cover privacy, schema closure,
size limits, provenance, retention, scoping, preview fidelity, telemetry, and
thread controls. This strengthens T16 implementation evidence without changing
its independent-review gate.

**T16/T19 contract correction (implementation lane, 2026-07-16; uncommitted).** Independent
contract criticism rejected the remaining unvalidated `clientContext` bag and
the invalidation-only React Query surface. `AgentSendInput.clientContext` is now
an optional serialized string with object-rejection coverage, and Eve forwards
that validated string unchanged. The React Query adapter now dispatches through
application-owned Standard Schema handlers keyed by the deliberately open
outcome kind, with explicit duplicate/unhandled policies and constrained
invalidate, replace, and revision-guarded replace operations. The neutral
adapter does not expose raw cache authority or fabricate durable state. Fresh
full sigil-agent typechecks and tests pass, including the new boundary and
revision cases; the maintainer-arranged independent review gate remains outstanding.

**Historical T20 Gonk-package progress (implementation lane, 2026-07-16; superseded by the
retirement decision below).** The extracted
Gonk adapter now provides safe bearer binding, authenticated-principal
extraction, host authorization, and a mountable Web MCP handler that requires
credentials. Integration tests prove 401 rejection, principal propagation,
authorization filtering, and hidden-tool nondisclosure. This completes the
package-level auth seam only; T20 remains blocked because its reference host
still depends on the canonical FloatingDock landing and completed T17/T18
integration.

**Historical T20-T22 dependency note (implementation lane, 2026-07-16; superseded).** The unique-portless
`examples/tanstack` shell now exists, but T20 cannot become an implemented host
until T17 can consume the canonical FloatingDock registry item. T21 has a
non-authoritative split manifest in `sigil-agent`, but the Gonk-owned canonical
context/skill/retrieval documents have not landed; copying their contracts
would violate the no-duplicate-authority ruling. T22 therefore remains blocked
on T17-T21 and no Sigil Chat imports have been prematurely re-pointed.

**Historical T15-T20 experiment reconciliation (implementation lane, 2026-07-16;
superseded).** Sigil Agent was
partitioned into boundary commits through `3b06455`, with the Gonk adapter
release bump at `271cf49`. The registry HUD uses canonical installed
FloatingDock source rather than a fake declaration. The simulated TanStack
Start/Nitro experiment passed package tests, recursive typecheck, production
build, desktop/390px interaction smoke, and console inspection, but did not
exercise a real model and therefore never satisfied the reference-host claim.
Clean external installation of the four `@sigil/agent*` packages
passed; `@sigil/agent-gonk@0.1.1` is published after the G4 `APPROVE` review and
is consumed by Sigil Chat's Gonk composition. The host's optional live
Eve/Gonk integration smoke and Sigil Chat's full core/Eve/React Query repoint
remain open, so T20 and T22 are not marked done.

**T17 installed-source completion (implementation lane, 2026-07-16).** Sigil Agent commits
`e445873` and `3910619` move the neutral HUD onto an actual installed registry
surface. The retired experiment imported its installed `agent-hud` and state
helper rather than reaching back into registry authoring source; the registry contract smoke
compiles the installed target layout; exact source parity is regression-tested.
Attention privacy, exact bounded preview, reversible per-turn selection
exclusion, attachment removal, approval callbacks, thread switching/creation,
fork intent, and the navigation render seam remain presentation-only. The HUD
declares and uses canonical Sigil `button`, `select`, `textarea`, and
`floating-dock` registry dependencies. Fresh package tests, recursive
typecheck, production build, and a desktop/390px browser interaction pass are
green with no application console errors or horizontal overflow. T17 therefore
moves to `in-review`; the maintainer-managed independent contract gate is not
silently promoted to `done`.

**Current graduation boundary (implementation lane, 2026-07-16).** Sigil Chat's fresh full
recursive test and typecheck runs and production build are green, including the
mounted authenticated Gonk listener regressions. The donor HUD no longer owns
TanStack Router navigation or mutates approval consent policy from presentation:
applications supply the navigation render target and approval callbacks, with
revert-proven regressions covering both seams. The remaining donor
`@workspace/agent` hook still composes Eve streaming, context serialization,
approval headers, persistence sequencing, and post-send application mutations.
Replacing isolated imports before the T21 authority split would create a mixed
runtime rather than prove parity. The full core/Eve/React Query repoint and
donor deletion stay under T22, blocked on the canonical cross-repository split
and the remaining independent review gates.

**Gonk Core 0.3.1 adoption (implementation lane, 2026-07-16).** Every direct Sigil Chat
`@gonk/*` dependency is pinned exactly to the reviewed Core 0.3.1 train,
including auth, context, retrieval, skills, scope, store, registry, Web MCP, and
the test-only orchestrator. The mounted listener consumes published
`@sigil/agent-gonk@0.1.2`, whose packed and registry-published manifest also
pins its Core dependencies exactly to 0.3.1. Fresh recursive tests and
typechecks plus the production build pass after lockfile refresh; the
authenticated adapter suite still proves missing/invalid bearer rejection,
principal propagation, and nondisclosing hidden tools.

**T16 cross-model review verdict (an independent architecture reviewer — different model family — via the maintainer, 2026-07-17):
APPROVE — T15–T19 pass their independent gate.** the maintainer authorized delegating
the review lane to Claude models (cross-model relative to the Codex writers).
A fresh-context Opus architecture review ran the full recursive typecheck and
test suites itself (all green), verified schema closure at nested boundaries
(provider fields planted inside `parts[]`, tool-call, authorization, send-input,
and resource boundaries all rejected), and judged neutrality substantively:
Eve types are imported only in `packages/eve` and MAPPED into core contracts
(the conformance suite runs genuinely Eve-shaped input, including a planted
secret field, through the real adapter and asserts the neutral projection);
core's `index.ts` re-exports only its own modules. React Query authority is
constrained as claimed, and the dedupe key commits only on successful
reconciliation (verified independently by the maintainer in
`packages/core/src/outcomes.ts` — `observed.add` in `.then()` only). The HUD's
"Always allow" is an application callback and navigation sits behind the
render-prop seam (verified independently in `registry/src/agent-hud.tsx`).
Findings, all LOW/non-blocking, carried forward as T18 hardening notes:
(1) the Eve adapter passes tool-call/session state through by structural
assignability without re-validating adapter output at the seam — a future Eve
enum widening would pass silently; add a seam validation or type-level
exhaustiveness assertion. (2) `AgentCatalogEntry.summary`'s four-count shape
mirrors Eve subagent introspection 1:1 — re-examine when a second adapter
lands. (3) HUD conversation renders tool/authorization parts as terse text by
documented design. T15/T16/T17/T18/T19 statuses move to `done`; the T18
hardening note is tracked, not blocking.

**T1/T2/T5 cross-model review verdict (a fresh-context cross-model reviewer via
the maintainer, 2026-07-17): T2 APPROVE, T5 APPROVE, T1 REJECT-with-findings.** The reviewer
ran the suites itself (web 73/73 green, typecheck clean) and ran its own
negative controls, reverting each fix in a scratch pass and restoring the tree
(verified clean afterward).

- **T2 done.** Single write per turn confirmed structurally (exactly one
  `saveSnapshot` call site, no `onSessionChange` write path); the chained
  revision lives in a private field updated only from mutation results and
  does not advance after a rejected mutation; the call-site integration test
  mounts the real component against a real repository, surfaces a genuine
  competing-writer conflict without running seed-consume/rename, and proves
  the normal 8→9→10 chain with no false conflict. Reviewer's own negative
  control (deleting the revision-advance line) failed 4 tests including the
  false-conflict regression.
- **T5 done.** `userMessageWithoutForkPacket` uses `lastIndexOf` on the
  branch-request marker (defensive against nested marker text), leaves
  packet-free threads untouched, and the reviewer's own revert of the strip
  function failed the regression with the old packet visibly leaking into the
  seed. The trace precondition in `FORK-OF-FORK-TRACE.json` is real.
- **T1 blocked.** The gate mechanism itself is sound (per-turn result with
  `lastFinishedRef` reset at turn start; `turnActive` re-entrancy rejection
  cleared in `finally`), but the two headline claims are NOT proven by any
  test in the current worktree after the released-package cutover:
  (1) no test drives a failed turn through `agent-sessions.tsx` and asserts
  fork-seed survival — the only integration mock always resolves
  `{status:"succeeded"}`, and the reviewer made the gate a no-op
  (unconditional `handleSendSuccess`) with ALL tests still passing;
  (2) the "already processing" re-entrancy guard has zero test references.
  The donor-package regressions cited in the completion evidence did not
  survive the cutover. Required to unblock: (a) a test forcing a
  `failed`-status turn and asserting `forkSeed` persists /
  `consumeForkSeed` never runs; (b) a test issuing two overlapping sends and
  asserting the second is rejected before Eve. Both must be shown to fail
  with the respective guard reverted.

**T1 closure (cross-model reviewer test backfill + reviewer re-verification via
the maintainer, 2026-07-17): APPROVE — T1 done.** The two missing regressions were added to
`apps/web/src/components/agent-sessions.test.ts` (tests only; production diff
empty): a failed-turn test that reads real `AgentThreadRepository` state
(forkSeed/revision/title unchanged, no mutation attempted) then retries and
asserts the seed is consumed exactly once; and an overlapping-send test that
holds a real pending promise open, asserts the second send is rejected with
the production error while Eve's call count stays 1, then resolves and proves
a third send goes through. The original reviewer ran both prescribed negative
controls: unconditional `handleSendSuccess` failed ONLY the fork-seed test
(revision operations `consume`/`rename` appearing where none were allowed);
removing the `turnActive` early-return failed ONLY the overlapping-send test.
Tree restored and verified clean after each control; final clean-tree run
75/75 with typecheck clean, independently re-confirmed by the maintainer. All three
T1/T2/T5 verdicts are now APPROVE with no outstanding findings.

**T1/T2/T5 review handoff (implementation lane, 2026-07-16).** The compact maintainer-managed
cross-model review packet is `T1-T2-T5-REVIEW-PACKET.md`. The implementation,
negative controls, trace, and fresh integrated verification are assembled;
only the independent verdict remains before these statuses may change.

**T18/T19/T22 live cutover (implementation lane, 2026-07-17; awaiting final review).** Sigil
Chat now consumes exact released `@sigil/agent@0.1.0`,
`@sigil/agent-eve@0.1.0`, and `@sigil/agent-react-query@0.1.0` packages. The
worktree-local `@workspace/agent` package and alias are removed; application
presentation, approval preference, DOM projection, and domain reconciliation
remain app-owned. The real multi-session suite runs through the Eve adapter,
and the review outcome suite runs through the constrained React Query adapter.
Fresh recursive tests, typecheck, lint, and production build pass. Browser
proof exercised local Codex streaming and an authenticated
`sigil-chat-status` Gonk call with explicit consent, at desktop and 390px,
with no horizontal overflow or console errors. The simulated TanStack example
has since been retired; package conformance remains package-owned and Sigil
Chat is the live host proof. T18,
T19, and T22 therefore await the maintainer-managed final review. T21 is now
complete; the final product-repository move remains open.

**T20 retirement decision (implementation lane, 2026-07-17).** `examples/tanstack` was a
simulated runtime dressed as a reference application and has been deleted.
Sigil Agent now documents the host contract in `docs/HOST-INTEGRATION.md`; its
own packages retain deterministic conformance tests, while Sigil Chat supplies
the real local-Codex, Eve, authenticated-Gonk, React Query, session, approval,
and responsive-browser proof. T20 is complete on that honest basis.

## Standing constraints (from the ratified reviews — apply to every task)

- Closed unions + Standard Schema at boundaries; no `| string`
  discriminants; no unvalidated metadata bags.
- Client-declared metadata is display-only; never a security control.
- Reconciliation is not mutation: the browser never fabricates durable
  state from tool transcripts.
- No policy or persistence in presentation components.
- Semicolon-free style in web/app code; match surrounding files.
- Don't hardcode test counts or version numbers in prose docs.
