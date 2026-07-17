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
  and forking. Implemented MVP, reviewed SHIP-WITH-FIXES (two defects called
  out; check current status before relying on it as fully closed).
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
- [`SIGIL-CHAT-GRADUATION-TASKS.md`](SIGIL-CHAT-GRADUATION-TASKS.md) — the
  current active remaining-work ledger for the Sigil Chat / Sigil Agent
  graduation. Supersedes `EXECUTION-TASKS.md` as the thing to read for
  "what's left."
- [`GONK-MCP-AUTH-INTEGRATION-SPEC.md`](GONK-MCP-AUTH-INTEGRATION-SPEC.md) /
  [`GONK-CORE-REVIEW-RESPONSE.md`](GONK-CORE-REVIEW-RESPONSE.md) — the
  proposal and Gonk Core's response that shaped the current
  `GONK_MCP_KEY` bearer-auth integration in `apps/gonk`. The proposal is
  resolved (recommended judgment: proceed with the external-provider
  pattern); read together if touching MCP auth.

## Historical / evidence records

Record what happened; not sources of current truth for ongoing design.

- [`EXECUTION-TASKS.md`](EXECUTION-TASKS.md) — explicitly superseded by
  `SIGIL-CHAT-GRADUATION-TASKS.md`; retained as the authoritative T1–T22
  history and evidence record.
- [`SIGIL-AGENT-EXTRACTION-DISPOSITION.md`](SIGIL-AGENT-EXTRACTION-DISPOSITION.md)
  — the amended disposition ruling on the sigil-design/sigil-agent
  fork-vs-merge question. Settled decision record.
- [`GRADUATION-REVIEW-AND-MOVE-HANDOFF.md`](GRADUATION-REVIEW-AND-MOVE-HANDOFF.md)
  — the executed graduation/move handoff, including the "Canonical versus
  awaiting review" ownership split referenced from `.agents/index.md`.
- [`T1-T2-T5-REVIEW-PACKET.md`](T1-T2-T5-REVIEW-PACKET.md) — independent
  cross-model review packet for tasks T1/T2/T5. Evidence record of a
  completed review pass.
- [`AGENT-CONTEXT-MANAGEMENT-SPEC.md`](AGENT-CONTEXT-MANAGEMENT-SPEC.md) —
  provenance note only. The former mixed spec was split 2026-07-17; canonical
  content now lives in Gonk Core (`docs/context-design.md`, `@gonk/context`)
  and `sigil-agent` (`docs/specs/CONTEXT-CONSUMER-PROFILE.md`). Do not
  restore contract content here.
- [`AGENT-RETRIEVAL-SPEC.md`](AGENT-RETRIEVAL-SPEC.md) — provenance note
  only, same 2026-07-17 authority split as above; canonical content moved
  out of this repo.
- [`AGENT-SKILL-MANAGEMENT-SPEC.md`](AGENT-SKILL-MANAGEMENT-SPEC.md) —
  provenance note only, same split; canonical content moved out of this repo.
- [`FORK-OF-FORK-TRACE.json`](FORK-OF-FORK-TRACE.json) — a captured live Eve
  HTTP session used as bug-finding evidence (a persisted message-prefix
  finding). Raw evidence artifact, not a spec.

## Inherited from the `sigil-design` lineage — not Sigil Chat scope

Design-system registry/CLI/theming documents carried over through shared git
history were removed from this repository's tracked docs; the Sigil Design
repository's own `docs/specs/` is authoritative for that material. (Local
checkouts may retain copies under the gitignored `docs.local/`.)
