# Sigil Chat — user stories / dispatch manifest

> The embedded backlog. Each story is sized to be built and verified as one
> unit, carries **checkable** acceptance criteria, a **build routing** (who
> implements it), and an explicit **review gate** (what David must sign off,
> and how). This doc is the spine three things share: the roadmap we curate
> together, the manifest subagents are dispatched against, and — once
> **Track 1** ships — the seed data for the in-tool board that assigns David
> his review tasks.
>
> Narrative "what & why" lives in [`FEATURE-ROADMAP.md`](FEATURE-ROADMAP.md);
> demo surfaces live in `docs.local/concepts/DEMO-CONCEPTS.md`. This file is
> the executable list.

## Legend

- **Routing** — who builds it, honoring the standing rule *UI/UX & taste →
  Claude only; mechanical/plumbing → pi gpt-5.6-luna (high thinking)*:
  - `claude:opus` — taste-bearing design, cross-cutting contracts, hard UX.
  - `claude:sonnet` — standard UI/component/workspace build.
  - `pi:luna` — mechanical plumbing (registry handlers, server fns, schema,
    env) with **no** taste surface. Never touches visual/interaction design.
  - `self` — the coordinating session (specs, story curation, verification).
- **Review gate** — `browser:David` (only David can confirm the live
  behavior), `decision:David` (a scope/shape call), or `peer` (fresh-context
  agent review, no David needed).
- **Status** — `shipped` · `verify` (built, awaiting review) · `ready`
  (spec'd, dispatchable) · `spec` (needs a short spec before build) · `idea`.

---

## Track 0 — Attachments & Ingress (in flight)

- **S0.1 — Vision + text-document delivery** · `shipped` / delivery `verified`
  Attachments reach the model: images inline as data URLs (vision), text files
  decoded to text parts. `@zigil/agent-eve` 0.1.5 inlines browser-side (the AI
  SDK SSRF-guards local URL downloads upstream of the model). **Delivery is
  confirmed working** (David's smoke: the md content reached the model). BUT the
  **inline-text UX is spammy** (a whole file dumped into the turn) — superseded
  for text files by **Track 6 (Session Artifacts)**. Images stay inline (vision
  needs the bytes; SSRF blocks a URL ref).

- **S0.2 — Ingress Cores showcase** · `shipped`
  Two exhibits under `/showcase/hooks` (sigil-design): Sheets round-trip grid +
  `.env` paste-to-populate form, composing `useClipboard` + `delimited`/`dotenv`.
  - AC: `tsc --noEmit` 0 errors + `vite build` ✓ (met). **Gate: `browser:David`**
    (eyeball the two exhibits render + round-trip).

- **S0.3 — Land the milestone as commits** · `ready`
  Concern-grouped commits across sigil-design + the sigil-chat `dev` worktree
  (no push). Behavioral attachment commits wait on S0.1's browser gate; the
  headless cores/showcase (already green) can land immediately.
  - AC: separate commits by concern; trailers present; graduated `main` and
    unrelated WIP untouched; hashes reported.
  - Routing: `self` (grouping needs judgment on shared WIP). **Gate: `peer`**.

- **S0.4 — Durable attachment reload** · *folded into Track 6*
  Thumbnails vanish on refresh (inline bloat; eve doesn't persist inline). The
  fix is the same session-artifact store as the de-spam work — see Track 6.

## Track 6 — Session artifacts / file management (David, 2026-07-18) · HIGH

David: *"the .md inline text is very spammy… ideally file/artifact management
associated with a session, so an agent can refer back to documents
persistently."* Attachments become durable, session-scoped artifacts the agent
reads on demand — not turn-bloat. Solves spam + durable reload (S0.4) + gives
the agent a persistent document workspace (converges with Track 3 blackboard).
**Substrate: extend the EXISTING gonk artifact store** (`apps/gonk/src/artifact-store.ts`
— images already flow through it via `/img`); do not invent a new store.

- **S6.0 — Model-vs-display contract** · `decided:David` — the model receives
  **the reference AND the full text automatically** (no tool round-trip for
  normal files); the **spam is the UI**, so the fix is a **display-vs-model
  split**: full text → model, compact **file chip** → transcript (don't render
  the attachment's text part inline). *Huge files → summarize via RLM +
  subagents — a LATER feature, not now.*
- **S6.1 — Artifact store + session scoping** · `ready` — extend the gonk
  artifact store to hold arbitrary file bytes (md/csv/txt/…, not just images)
  keyed by the eve session id; durable across reload. AC: upload a file →
  persisted + retrievable by id after restart. Routing: `pi:luna`. Gate `peer`.
- **S6.2 — Display-vs-model split (`@zigil/agent-eve` 0.1.6 + transcript
  rendering)** · `ready` → after S6.1 — the model still gets the full text (as
  today) plus a durable artifact reference; the transcript stops rendering the
  attachment's text part inline and shows a **file chip** instead. Images
  unchanged (inline vision). AC: attach an md → model can still quote it, but
  your message bubble shows a chip, not a fenced dump. Routing: `self`
  (agent-eve + core message rendering — taste-bearing). Gate `browser:David`.
- **S6.3 — `sigil-file-*` gonk tools** · `ready` → after S6.1 —
  `sigil-list-session-files` + `sigil-read-file(id)` so the agent fetches
  content on demand ("refer back persistently"). AC: agent asked to summarize an
  attached file calls read-file and answers from real content. Routing:
  `pi:luna`. Gate `peer`.
- **S6.4 — File-chip UI + durable reload** · `ready` → after S6.1 — attachments
  render as file chips in the user's message (already partly true) and **survive
  a refresh** because they're artifact-backed. AC: reload the page → chips + the
  agent's ability to re-read them persist. Routing: `claude:sonnet`. Gate
  `browser:David`.

## Track 1 — Roadmap & review surface (the centerpiece David asked for)

The in-tool home for *these very stories*, where the agent assigns David review
tasks. Built on the existing `review-store` / domain-outcome (`clientCommand`)
lineage — a work-items store, `sigil-story-*` gonk tools, an `_app/roadmap`
workspace, and a review queue.

- **S1.0 — Shape decision** · `decision:David`
  New dedicated **Roadmap workspace** with stories as live agent-editable domain
  objects + a David review queue (recommended), vs. a lighter read-only render of
  this file + the existing review workspace. *Blocks S1.1–S1.4.*

- **S1.1 — `work-items-store` package + story schema** · `ready` → after S1.0
  A `@workspace/work-items-store` repo (mirror `review-store`): `Story` type
  (id, title, intent, acceptanceCriteria[], status, routing, assignee,
  reviewGate, deps[]), append-only revisions, server fns + React Query hooks.
  Seed from this file.
  - AC: repo typechecks; unit tests for upsert/assign/transition; seed loads
    these stories. Routing: `pi:luna` (schema + repo + server fns; no UI).
    **Gate: `peer`**.

- **S1.2 — `sigil-story-*` gonk tools** · `ready` → after S1.1
  `sigil-story-upsert`, `sigil-story-transition`, `sigil-story-assign-review`
  in `apps/gonk/src/registry.ts`, each returning a `clientCommand` so the board
  reacts. `assign-review` targets David and creates a review item.
  - AC: `tools/list` shows them; driving one in chat mutates the board; exec
    tier still denied by policy. Routing: `pi:luna`. **Gate: `peer`**.

- **S1.3 — Roadmap workspace UI** · `ready` → after S1.1
  `_app/roadmap.tsx` + components: a board grouped by status, a `Story.Root`
  compound component, a detail/editor panel, and a **review queue** surfacing
  `assignee:David` items with approve / request-changes that feeds back through
  the domain-outcome loop. Nav entry in the `_app` shell.
  - AC: renders the seeded stories; approving a review item transitions it;
    route header comment present; typecheck + build + browser-clean console.
  - Routing: `claude:opus` (this is the taste centerpiece). **Gate:
    `browser:David`**.

- **S1.4 — Agent authoring loop** · `spec` → after S1.2 + S1.3
  Agent instructions + a skill so the agent proposes/updates stories and assigns
  David reviews as a normal part of working. Closes the "assign me review tasks
  within the tool" loop.
  - Routing: `self` (instructions/skill = judgment). **Gate: `browser:David`**.

## Track 2 — Agent operations surfaces (David, 2026-07-18)

Spec DONE → `docs.local/specs/AGENT-OPS-SURFACES.md` (9 dispatchable briefs).
Share one composable "resource manager" shell (list + detail), not three
bespoke screens. Grounded reality + autonomous decisions recorded below.

- **S2.0 — Resource-manager shell** · `ready` — the shared list+detail layout
  S2.1–S2.3 reuse (compound Root/Parts). No deps; unblocks the three below.
  Routing: `claude:sonnet`. Gate `browser:David`.
- **S2.1 — View agents (read-only)** · `ready` — DECISION: read-only viewer.
  `defineAgent`/subagents are git-authored TS with no write API; authoring TS
  files is a separate future feature, not this. Project Eve's loaded agent
  info. Data `pi:luna` (Eve-info projection) · UI `claude:sonnet`.
- **S2.2 — Manage skills (CRUD)** · `ready` — genuinely buildable: `@gonk/skills`
  0.3.1 ships `FilesystemManagedSkillRegistry` CRUD, just never wired into the
  gonk MCP registry. Build ONE surface (view + author). **Absorbs S7.5.** All
  writes route through the gonk MCP owner (its registry locking) so `apps/gonk`
  + `apps/agent` don't race the skills dir. Data `pi:luna` (new
  `apps/gonk/src/registry/skills.ts`) · UI `claude:sonnet`.
- **S2.3 — Tool permissions & catalog** · `ready` — per-tool approval defaults
  are real plumbing (SDK `ApprovalContext.toolName` is already per-call): header
  → `channels/eve.ts` → `connections/gonk.ts`; never touches the server exec-tier
  hard-deny. Data `pi:luna` · UI `claude:sonnet`.

## Track 3 — Agent memory & workspace (David, 2026-07-18)

Spec DONE → `docs.local/specs/AGENT-MEMORY-WORKSPACE.md`. Substrates settled.
Guiding rule (from the dead `@gonk/retrieval` contributor): spec the CONSUMER
first — every AC is a behavioral A/B, never "the store persists."

- **S3.1 — Memory** · `ready` (one small call) — substrate `@mirk/store` (BM25
  lexical) in gonk; embeddings deferred (no embedder wired). Call: activate the
  already-written-but-dead `@gonk/retrieval` contributor via a half-day spike
  (recommended) vs. a bespoke ~40-line contributor (fallback, same behavior);
  default = spike retrieval, fall back if it fights us. Data `pi:luna` ·
  contributor `claude`/self.
- **S3.2 — Persistent blackboard** · `ready` — substrate `file-store-core`
  (mirror `review-store`); one small shared doc both parties edit, rides every
  turn. No David call. **Converges with Track 6.** Best first Track-3 build.
  Data `pi:luna` · UI `claude`.
- **S3.3 — Agent REPL (persistent)** · `ready` — **trust-model RESOLVED
  (David, 2026-07-18: "no problem with exec in sandbox").** Build on eve's
  per-session **microsandbox** (genuine isolation — the exec-tier deny is only
  an authz tier for the *unsandboxed gonk process*, not the sandbox). `/workspace`
  durable, interpreter heap not. Ship WITH Codex's hardening (make the boundary
  explicit): (a) authored `apps/agent/agent/sandbox.ts` pinning Microsandbox;
  (b) network **deny-all** / narrow allow-list; (c) wrap/approve unrestricted
  `bash`/`write_file` (explicit exec approval, not silent); (d) seed only the
  session's active workspace channel. **Keep Gonk `exec` denied** — never run
  arbitrary commands in the gonk process; delegate into the sandbox if needed.
  Routing: hardening + REPL tool `pi:luna`/self · REPL UI `claude`. Gate
  `browser:David` (the running surface, not the boundary decision).
  **Scope (David, 2026-07-18):** real use cases — agents writing scripts, saving
  data-pull outputs, transforms, authoring/testing their own persistent skills,
  self-improvement loops. This is the eve-sandbox execution surface; it does NOT
  need gonk exec (which stays denied, orthogonal). Depends on **S3.4** for cloud.

- **S3.4 — Sandbox provider: local → cloud, per-user** · `spec` **(aligns to
  `docs/specs/AUTH-AND-USER-SETTINGS-SPEC.md`)** — eve's sandbox today is one
  microsandbox per eve *session* (local-dev only: Apple-Silicon microsandbox, no
  Docker; not per product-channel, not per-user). Cloud needs a per-user
  cloud-grade sandbox (microVM/container — Firecracker/gVisor/etc.). Make eve's
  sandbox a **pluggable provider** (microsandbox local / cloud-sandbox prod).
  **Isolation boundary = the authenticated Better Auth `User` (`user_01…`)**,
  propagated as the trusted principal Web→Eve→sandbox — NOT the eve session and
  NOT a `@gonk/scope` tier (the auth spec is explicit these are not ownership
  boundaries). Verify: subagent sandbox isolation; session→User mapping.
  **Blocks cloud deploy of any exec surface;** design with the auth spec, not
  after it.

## Track 4 — Demo surfaces (future; menu in DEMO-CONCEPTS)

Chosen: **Evidence Room** (codex). Added: **Compendium** (fixture-data CMS —
pays back Ingress). Parked menu: Keep / Atelier / Orrery + codex's sets. All
`idea`; each is a focused slice, not a product. UI → `claude`.

## Track 5 — Hygiene

- **S5.1 — Emphasis extraction** · `ready` (API captured in sigil-design
  `INGRESS-CORES.md`) — extract `agent-dom-effects` → headless
  `@workspace/ui` `imperative-emphasis` **and** rewire the sigil-chat agent path
  to consume it (same slice, or it orphans). Routing: `claude:sonnet` (interaction
  primitive). **Gate: `browser:David`** (live agent-highlight path).
- **S5.2 — Fix stale `@niwork` docs** · `ready` — `sigil-chat-dev/CLAUDE.md`
  still says "consumes `@niwork/agent*`"; the `dev` branch repointed to
  `@zigil`. Correct the package names + the "graduated…@niwork" paragraph.
  Routing: `pi:luna` (doc edit). **Gate: `peer`**.

## Track 7 — Gonk integration hygiene (from the 2026-07-18 gonk eval)

Grounded in Codex's `GONK-INTEGRATION-STATUS-20260718.md` + a fresh import
audit. Solid REUSE layer (no story needed): `@gonk/tool-registry`(+`-mcp`),
`@gonk/scope`+`@gonk/store` — live, verified in code. The rest:

- **S7.0 — Work-items substrate reconciliation** · `resolved` (2026-07-18) —
  VERDICT: **keep the local store; add a documented `GonkWorkItemsRepository`
  adapter seam.** `@gonk/work-items` is mature (0.5.0, 8 consumers) but models
  *supervised agent jobs* (goal + jobs + supervisor tick), not roadmap stories:
  ~2 of ~17 Story fields map (id, assignee); no acceptance criteria, epics,
  deps, routing, review gates, comments, or revision/history, and its README
  forbids stuffing those into `meta`. The genuine overlap is the review/attention
  queue (its `InboxStore` + `owner`/`assignedBy` ≈ our `ReviewItem`) — reconcile
  THERE, at the `WorkItemsRepository` interface seam, not by re-backing the Story
  record. Track 1 unblocked. *Follow-up: document the seam + reserve the adapter
  name (light).*
- **S7.1 — Retrieval: wire or drop** · `ready` — `@gonk/retrieval` imported in
  `sigil-context.ts` but the default compiler never registers it + no live
  source → dead in prod. Wire one real source end-to-end OR drop the import.
- **S7.2 — Tool-orchestrator: productionize or remove** · `ready` — only a
  test import; `registry.ts` calls `createSigilRegistry()` directly. Orphaned.
- **S7.3 — Auth: real principal separation** · `spec` — production collapses to
  one global service principal; the grant seams exist but per-user/workspace
  authz at the tool boundary doesn't.
- **S7.4 — Context receipts** · `spec` — `@gonk/context` runs every turn but
  compiler receipts aren't persisted/surfaced; auditability missing.
- **S7.5 — Skills lifecycle UI** · `ready` — `/skills` is a read-only catalog
  with a stale "unavailable" message though `@gonk/skills` 0.3.1 ships the
  lifecycle. **Overlaps Track 2 S2.2** — build them together.
- **S7.6 — Graduate image-gen** · `ready` — `registry/codex-image.ts` is a
  local fork that names its own debt; publish/consume `@gonk/image-gen`.
- **S7.7 — Capability channels** · `spec` — every tool is `visibility:"always"`;
  the `@gonk/channel` proposal is the real fix for the prompt-budget problem.
  Proposal-only today; schedule, don't build blind.
