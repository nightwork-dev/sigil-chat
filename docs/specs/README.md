# Specs index

One line per spec. Classified by reading each file's status header, not by
filename guess. See [`.agents/index.md`](../../.agents/index.md) for the
product overview.

## Active contracts

Currently authoritative for this product's design/implementation.

- [`SCOPE-COMPOSITION-AND-SCOPED-WORK-SPEC.md`](SCOPE-COMPOSITION-AND-SCOPED-WORK-SPEC.md) —
  canonical ownership remains singular while typed, ordered scope links enable
  shared workspaces, resource participation, default contribution, and
  explicit work rollups. Defines the principal overlay, entered-via
  perspective, per-resource resolution rules, scope-rooted board views, safe
  agent-authored feature requests, and the project/workspace/session home-view
  direction. Ratified product and architecture contract; supersedes the strict
  hierarchy in `PROJECT-WORKSPACE-KNOWLEDGE-SPEC.md` sections 1–3.

- [`PRODUCT-HOMES-IA-PROPOSAL.md`](PRODUCT-HOMES-IA-PROPOSAL.md) —
  the information-architecture response to the scope contract: Project Home,
  Workspace Home, and Session as the three orientation layers; breadcrumbs as
  a visibility-filtered via-path; home-oriented surface navigation; shared
  workspace ownership cues; and the empty/loading/denied/archived/mobile/
  keyboard state matrix. Design proposal for the SC.7 implementation slice.

- [`AGENT-SURFACE-COORDINATION-SPEC.md`](AGENT-SURFACE-COORDINATION-SPEC.md) —
  the spatial third of the attention/projection triangle: the agent's presence
  and output span the whole application surface, not just the current view.
  Annotations carry a `view` (route + workspace); cross-view annotations
  surface as honest indicators (route badges + an attention-tile count);
  `sigil-navigate` / `sigil-guide` let the agent switch the user's view or walk
  them through highlighted places; and an eventual agent canvas (on sigil-design
  `packages/canvas`) composes panels of content. Draft product spec.

- [`AGENT-OUTPUT-PROJECTION-SPEC.md`](AGENT-OUTPUT-PROJECTION-SPEC.md) —
  companion to `AGENT-CONTEXT-AWARENESS-SPEC.md` (the *output* half to that
  spec's *input* half): how agent actions surface on the canvas, not just the
  transcript. A part-projection registry renders tool-calls as anchored
  overlays or ambient panels instead of transcript lines; agent annotation
  tools (`sigil-annotate`/`pin`/`highlight`) anchor to attention items. Draft
  product spec.

- [`PRODUCT-CHROME-REWORK-SPEC.md`](PRODUCT-CHROME-REWORK-SPEC.md) —
  make Projects/Workspaces the visible organizing center of the app shell
  (two-level chrome: container context + feature surface); elevate the Cmd+K
  omnibar to fluid project/workspace/session switching *and* as a direct agent
  input (message mode); and define a family of agent chat-panel variants
  (dock / sidecar / inline / omnibar / strip) so the one conversation can be
  presented where a surface needs it. Also closes the consistency gaps
  (doubled agent presentation on `/review`, Button/Link semantics, the
  non-owner Agent dead-end). Draft product/UX spec; builds on PROJ.1/PROJ.2.

- [`AUTH-AND-USER-SETTINGS-SPEC.md`](AUTH-AND-USER-SETTINGS-SPEC.md) —
  Better Auth username/password accounts, user settings, channel membership,
  owner-scoped application records, and trusted principal propagation from Web
  through Eve to Gonk. Ratified architecture contract; implementation pending.

- [`DEPLOYMENT-INVITE-DEMO-SPEC.md`](DEPLOYMENT-INVITE-DEMO-SPEC.md) —
  disposable one-origin, invite-only deployment and teardown contract with a
  secret-free Compose topology fixture. Specification only; public deployment
  is blocked on membership, principal-propagation, retention, and credential
  proofs.

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

## Proposed cross-repository contracts

Targets that Sigil Chat requires but whose upstream implementation ownership is
not yet ratified.

- [`APPLICATION-STORAGE-CONSOLIDATION-SPEC.md`](APPLICATION-STORAGE-CONSOLIDATION-SPEC.md) —
  one host-configured transactional application database with logical store
  namespaces, adjacent artifact bytes, and one ordinary `SIGIL_DATA_DIR`.
  Defines the proof that will determine whether the enabling change belongs in
  Mirk, Gonk, Sigil composition, or a narrow combination of them.

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

## Inherited from the `sigil-design` lineage — not Sigil Chat scope

Design-system registry/CLI/theming documents carried over through shared git
history were removed from this repository's tracked docs; the Sigil Design
repository's own `docs/specs/` is authoritative for that material.
