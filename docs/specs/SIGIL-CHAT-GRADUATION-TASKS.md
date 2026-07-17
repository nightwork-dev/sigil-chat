# Sigil Chat / Sigil Agent graduation worklist

> Status: active remaining-work ledger
> Updated: 2026-07-17 (Sigil Chat live-runtime cutover)
> Detailed historical evidence: `EXECUTION-TASKS.md`

This file is the execution brief for finishing the extraction. The older
ledger retains the full T1–T22 evidence trail; this list states what remains
from the current filesystem rather than repeating completed history.

## Outcome

Produce a versioned, runtime-neutral Sigil Agent family, prove it in the real
Sigil Chat host, then graduate Sigil Chat out of the template worktree.

The extraction is not complete merely because contracts compile. A new app
must be able to embed a real authenticated agent surface without importing Eve
types into core UI or copying Sigil Chat application code.

## Current truth

- [x] Initial `sigil-agent` repository and neutral seam committed at `0cf72f4`.
- [x] Sigil Agent implementation is partitioned into boundary commits on
  `codex/sigil-agent-extraction`.
- [x] T3, T4, T6, T7, T8, T9, and T10–T13 have passed their recorded gates.
- [x] `FloatingDock` is canonical on Sigil Design `main` at `3cc0bee`.
- [x] T1, T2, and T5 passed independent cross-model review closure
  (2026-07-17); T1 required a tests-only regression backfill first.
- [x] The temporary FloatingDock declaration is gone; the registry HUD and
  Sigil Chat consume canonical installed source.
- [x] The simulated TanStack example has been retired. Package-level
  conformance stays with the packages; `sigil-agent/docs/HOST-INTEGRATION.md`
  records what a real host must own.
- [x] Sigil Chat is the canonical live integration host: it consumes the
  released neutral, Eve, and React Query packages; uses local Codex through
  Eve; and reaches authenticated Gonk tools through the mounted MCP adapter.
- [x] `@sigil/agent-gonk@0.1.2` is published and consumed by Sigil Chat with
  exact Gonk Core 0.3.1 dependencies; the duplicate worktree-local adapter
  package has been removed.
- [x] The Gonk/Sigil documentation split is complete: Gonk Core owns the
  contracts and Sigil Agent owns three consumer profiles.
- [x] The final repository move is executed: this repository is canonical
  (2026-07-17). Only the source-worktree retirement remains, gated on
  destination live-browser acceptance.

## S0 — Stabilize the current work before more extraction

- [x] Record the exact dirty/untracked state of both `codex/sigil-chat` and
  `codex/sigil-agent-extraction` without normalizing unrelated work.
- [x] Partition the Sigil Agent changes into reviewable commits:
  1. neutral contracts and schemas;
  2. attention/context/thread contracts;
  3. React Query adapter;
  4. Eve adapter;
  5. Gonk adapter;
  6. registry components;
  7. host integration contract and docs.
- [x] Keep provenance for any file moved or structurally rewritten from Sigil
  Chat.
- [x] Remove generated/tool state from commit candidates.

Acceptance:

- every commit has one boundary-level purpose and its own green focused tests;
- no active authored work is lost; and
- reviewers can inspect contract, adapter, presentation, and host changes
  independently.

## S1 — Close remaining Sigil Chat correctness reviews (T1/T2/T5)

- [x] Prepare one compact review packet containing the negative controls and
  fresh evidence for failed-turn preservation, revision chaining, and
  fork-of-fork derivation (`T1-T2-T5-REVIEW-PACKET.md`).
- [x] Obtain the required independent review through the maintainer-managed
  review lane (the maintainer authorized Claude-lane delegation 2026-07-17;
  fresh-context cross-model reviewer, cross-model relative to the Codex
  writers).
- [x] Address findings with discriminating regressions (T1's two lost
  regressions were backfilled tests-only and shown to fail under guard
  reverts; T2/T5 approved on first pass with reviewer-run negative controls).
- [x] Mark T1/T2/T5 done only after the review result is recorded in
  `EXECUTION-TASKS.md` (verdicts and evidence recorded 2026-07-17).

Acceptance:

- failed turns retain fork seed, attachments, and exclusions;
- one successful turn performs one authoritative persistence chain; and
- second-generation forks never ingest the hidden fork packet as authored text.

## S2 — Finish Sigil Design prerequisites (T14)

- [x] Review and land `230d2fe` into Sigil Design canonical history
  (`3cc0bee` on `main`).
- [x] Replace the temporary `floating-dock-contract.d.ts` in Sigil Agent with a
  real registry-installed or workspace-resolved component.
- [x] Remove `json-value` from this extraction scope: its only current consumer
  is the Sigil Chat agent tool-call renderer, so there is no demonstrated
  generic Sigil Design consumer yet.
- [x] Remove neutral `emphasis-effects` from this extraction scope: no second
  non-agent consumer exists. The app-owned DOM projection remains behind the
  neutral client-command boundary until consumer pull justifies extraction.
- [x] Add/refresh showcase examples and external registry installation smokes
  for FloatingDock.

Acceptance:

- T14 is genuinely complete or any rejected sub-item is explicitly removed
  from scope;
- no compile-time fake stands in for FloatingDock; and
- UI tests, typecheck, build, registry build, browser interaction, and console
  checks pass.

## S3 — Ratify neutral core contracts (T16)

- [x] Review all public contracts for closed discriminants, Standard Schema
  validation, exact nested boundaries, serializability, and provider neutrality.
- [x] Confirm `packages/core` contains no Eve, Gonk, router, or TanStack imports.
- [x] Preserve the division between session/turn UI state and durable Gonk jobs.
- [x] Keep privacy serialization, attention telemetry, context drafts, thread
  controls, and domain outcomes runtime-neutral.
- [x] Run the shared conformance suite against both a stub runtime and Eve.
- [x] Obtain the required independent contract review before accepting T16
  (an independent architecture reviewer, different model family, cross-model
  review 2026-07-17, APPROVE; verdict and the three LOW carry-forward findings
  recorded in `EXECUTION-TASKS.md`).

Acceptance:

- `AgentRuntimeSession`, message/part/tool/authorization contracts, turn results,
  cancellation, capabilities, catalog, and outcomes are validated at ingress;
- unknown provider fields fail closed at public boundaries; and
- no core API is Eve-shaped behind an apparently neutral name.

## S4 — Complete the neutral component and registry port (T17)

- [x] Port the actual attention, approval, session/thread, context, and agent HUD
  presentation onto core contracts.
- [x] Keep approval UI callbacks in core while consent persistence, headers,
  storage keys, and “always allow” policy remain in the adapter/application.
- [x] Keep thread summaries, controls, fork intent, and provenance neutral; Eve
  session state remains in the Eve adapter.
- [x] Put navigation behind render props supplied by the application shell.
- [x] Use Sigil Design source-registry components rather than copying them into
  a versioned runtime package.

Acceptance:

- `rg "eve|@tanstack" packages/core registry/src` is clean except explicitly
  documented registry dependencies;
- presentation never directly mutates authorization policy; and
- the ported integration tests cover attention, approval, threads, fork intent,
  and navigation seams.

## S5 — Complete and prove the Eve adapter (T18)

- [x] Move Eve-only cursors, event translation, continuation behavior,
  fork-packet derivation, catalog projection, and origin configuration into
  `packages/eve`.
- [x] Repoint the real Sigil Chat multi-session suites through the adapter.
- [x] Prove success, failure, cancellation, reconnection, fork, fork-of-fork,
  and bounded/redacted event projection.
- [x] Keep continuation tokens owner-scoped and server-only; do not claim
  multi-process safety without a real CAS/transaction adapter.

Acceptance:

- Eve passes the shared conformance suite and Sigil Chat's real session tests;
- core public types never re-export Eve types; and
- local-only deployment limitations remain explicit until their gates exist.

## S6 — Finish the React Query adapter (T19)

- [x] Preserve application-owned outcome handlers and deliberately open outcome
  kinds while validating every received payload.
- [x] Keep raw cache authority private; expose constrained invalidate, replace,
  and revision-guarded replace operations.
- [x] Preserve deduplication, shared in-flight work, and retry after transient
  reconciliation failure.
- [x] Repoint Sigil Chat consumer tests to the extracted adapter.

Acceptance:

- unrelated resource kinds cannot invalidate review state;
- failed reconciliation does not permanently consume the dedupe key; and
- no durable state is fabricated from cache state.

## S7 — Accept the authenticated Gonk adapter

- [x] Finish review of `packages/gonk` against published Gonk auth/MCP contracts
  (G4 `APPROVE`; package-level hidden-vs-missing invocation regression added).
- [x] Preserve authenticated principal propagation, disclosure filtering,
  framework-mountable Web MCP, and separate application authorization/tool
  consent.
- [x] Consume the published Gonk package versions produced by the Gonk worklist.
- [x] Record security review evidence before release.

Acceptance:

- anonymous access receives 401 before catalog disclosure;
- hidden tools are absent from both list and invocation behavior; and
- the adapter owns no listener, role hierarchy, or duplicate auth model.

## S8 — Prove and document a real host (T20)

- [x] Retire `examples/tanstack`; a simulated runtime is not a reference host.
- [x] Keep deterministic conformance fixtures in their owning packages rather
  than wrapping them in a theatrical application.
- [x] Demonstrate authentication, local Codex streaming, authenticated Gonk
  tools, session creation/switching/forking, attention context, approval,
  cancellation, reconnect, and React Query reconciliation in Sigil Chat.
- [x] Document the host/package responsibility split in
  `sigil-agent/docs/HOST-INTEGRATION.md`.

Acceptance:

- Sigil Agent fresh install, typecheck, and package tests pass;
- the real host contains composition only, not a second implementation of the
  packages, and passes production build plus browser smoke; and
- a new app can embed the agent surface without importing Sigil Chat source.

## S9 — Complete the Gonk/consumer specification split (T21)

- [x] Reconcile the Gonk agent's canonical contract map and shipped package
  anchors.
- [x] Extract only context UI, skill catalog UI, retrieval/citation UI, React
  Query projections, and runtime-adapter guidance into Sigil Agent docs.
- [x] Replace mixed Sigil Chat specs with links and provenance notes.
- [x] Do not copy protocol, persistence, retrieval, authorization, or security
  contracts into Sigil Agent.

Acceptance:

- one authority per contract;
- consumer docs remain usable without restating Gonk interfaces; and
- `GONK-CONSUMER-SPLIT-MANIFEST.md` changes from prepared to executed.

## S10 — Repoint and graduate Sigil Chat (T22)

- [x] Replace worktree-local agent framework imports with released Sigil Agent
  packages and installed registry source.
- [x] Delete superseded local implementations only after parity tests prove the
  replacement.
- [x] Run full recursive typecheck/tests, Sigil Chat production build, browser
  session/approval/review flows, and console checks.
- [x] Publish/package Sigil Agent through its chosen versioned + registry hybrid
  distribution and prove a clean external install.
- [x] Prepare the final managed-review and rollback-safe move handoff in
  `GRADUATION-REVIEW-AND-MOVE-HANDOFF.md`.
- [x] Move Sigil Chat into its intended product repository only after the
  worktree is clean, reviewed, and rollback-safe (executed 2026-07-17 → this
  repository as a template/starter; full move record and the remaining
  live-browser retirement gate in `GRADUATION-REVIEW-AND-MOVE-HANDOFF.md`).

Acceptance:

- Sigil Chat consumes the released public surface and is the live host proof;
- no duplicate framework implementation remains hidden in the app;
- all T1–T22 gates are closed or explicitly removed with rationale; and
- the original worktree remains recoverable until graduation is verified.

## Explicit non-goals

- Do not begin a Dev Dashboard rebuild in this tranche.
- Do not move visual components out of Sigil Design when source-registry
  distribution is sufficient.
- Do not let presentation own consent policy or durable authorization.
- Do not claim multi-process durability from a file lock or in-memory revision.
- Do not turn Eve into the durable job runtime; long-running work belongs to
  Gonk jobs.

## Recommended order

`S0` first. Then `S1`, `S2`, and `S3` can proceed independently. Continue
`S4/S5/S6/S7`, build `S8`, execute `S9` atomically with Gonk, and finish with
`S10`.
