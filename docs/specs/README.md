# Specs index

One line per spec. Classified by reading each file's status header, not by
filename guess. See [`.agents/index.md`](../../.agents/index.md) for the
product overview.

## Active contracts

Currently authoritative for this product's design/implementation.

- [`AGENT-EMBEDDING-SPEC.md`](AGENT-EMBEDDING-SPEC.md) — `@workspace/agent`
  embeddable agent framework. Implemented and architect-approved; live-browser
  acceptance remains. Scoped to this repo, written to port cleanly to
  `sigil-design` later.
- [`AGENT-CONTEXT-AWARENESS-SPEC.md`](AGENT-CONTEXT-AWARENESS-SPEC.md) —
  shared-attention product model for Sigil agentic workspaces, beginning with
  Sigil Chat. Draft product spec; `AGENT-EMBEDDING-SPEC.md` implements its
  surfaces.
- [`AGENT-MULTI-SESSION-SPEC.md`](AGENT-MULTI-SESSION-SPEC.md) — multi-session
  and forking. Implemented; the two defects found in review shipped fixes and
  passed independent cross-model review closure.
- [`AGENT-REACT-QUERY-STATE-SPEC.md`](AGENT-REACT-QUERY-STATE-SPEC.md) —
  agentic application state through React Query. Draft for independent
  review; owner is the Sigil Chat application.
- [`AGENT-REVIEW-WORKSPACE-SPEC.md`](AGENT-REVIEW-WORKSPACE-SPEC.md) — review
  workspace (extraction reference: a companion writing/authoring project,
  read-only). Initial implementation; depends on `AGENT-EMBEDDING-SPEC.md`.
- [`AGENT-SESSION-RETENTION-ISSUE.md`](AGENT-SESSION-RETENTION-ISSUE.md) —
  session retention, redaction, and resume-secret handling. Decision
  accepted, product projection implemented, deployment gates still open.
  Referenced directly from the README trust-model section.
- [`GONK-MCP-AUTH-INTEGRATION-SPEC.md`](GONK-MCP-AUTH-INTEGRATION-SPEC.md) —
  the proposal that shaped the current `GONK_MCP_KEY` bearer-auth
  integration in `apps/gonk`. Gonk Core's review response (request-changes,
  since acted on) is retained locally alongside the rest of the extraction
  program's correspondence.

## Provenance notes

Pointer-only stubs for contracts whose canonical content moved to another
repository. Current and living, but intentionally thin — do not restore
contract content here.

- [`AGENT-CONTEXT-MANAGEMENT-SPEC.md`](AGENT-CONTEXT-MANAGEMENT-SPEC.md) —
  the former mixed spec was split 2026-07-17; canonical content now lives in
  Gonk Core (`docs/context-design.md`, `@gonk/context`) and `sigil-agent`
  (`docs/specs/CONTEXT-CONSUMER-PROFILE.md`).
- [`AGENT-RETRIEVAL-SPEC.md`](AGENT-RETRIEVAL-SPEC.md) — same 2026-07-17
  authority split; canonical content moved out of this repo to Gonk Core and
  `sigil-agent` (`docs/specs/RETRIEVAL-CONSUMER-PROFILE.md`).
- [`AGENT-SKILL-MANAGEMENT-SPEC.md`](AGENT-SKILL-MANAGEMENT-SPEC.md) — same
  split; canonical content moved out of this repo to Gonk Core and
  `sigil-agent` (`docs/specs/SKILLS-CONSUMER-PROFILE.md`).

## Program history

The T1–T22 execution ledger, the current graduation worklist, the
sigil-agent extraction disposition, the graduation/move handoff, the Gonk
Core review response, cross-model review packets, and raw bug-evidence
artifacts (including the fork-of-fork HTTP trace) are retained on disk under
the gitignored `docs.local/history/`, not in this tracked tree. They record
what happened (or, for the worklist, what remains within that history); they
are not sources of current truth for ongoing design — read the active
contracts above for that.

## Inherited from the `sigil-design` lineage — not Sigil Chat scope

Design-system registry/CLI/theming documents carried over through shared git
history were removed from this repository's tracked docs; the Sigil Design
repository's own `docs/specs/` is authoritative for that material. (Local
checkouts may retain copies under the gitignored `docs.local/`.)
