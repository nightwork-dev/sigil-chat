# Sigil Chat → sigil-design / sigil-agent extraction disposition

> Date: 2026-07-16 (the maintainer; amended same day per the second-lineage
> reviewer's review — accept with amendments)
> Status: Amended disposition for the maintainer's ruling
> Settles: the fork-vs-merge question from the original branch review, plus
> "what should exist in sigil-design vs a separate sigil-agent repository."
> Grounded in: the full uncommitted diff vs `main` (5fd7932), the two review
> passes, the Gonk Core response, and the ecosystem comparison rulings.
> The second-lineage reviewer's central amendment, verified and adopted: **Eve is not sigil-agent's
> core abstraction.** The ecosystem ruling names an "agent turn runtime"
> role with Eve as today's implementation. Third-round correction
> (verified): "only the session hook imports `eve/react`" is import-graph
> true but type-graph false — the hook RE-EXPORTS Eve types
> (`EveMessage`, `EveMessagePart`, `EveAuthorizationPart`, …) and every
> component consumes them through it, so the current package is Eve-shaped
> despite the clean import boundary. **The extraction is therefore
> contract-first, not file-first** (§B.0): define neutral contracts, then
> make the Eve adapter translate into them. The unused `ai` dependency is
> dropped at extraction.

## The litmus tests

**Sigil-design keeps** anything a non-agent application would want: design
system, registry components, app scaffold, report CLI, and domain-neutral
logic packages. Zero agent-runtime dependencies (`eve`, `ai`), zero
server-state infrastructure, zero product identity.

**Sigil-agent owns** anything that presumes an embedded agent: the versioned
contracts/adapters, owned-source registry UI, host responsibility contract,
state-boundary doctrine, and agent spec family. It consumes sigil-design
primitives the same way products do (registry install-as-owned-source) and is
consumed by products.

**Sigil-chat (the product) keeps** intent, examples, and identity: the demo
workspaces, routes, rebrand, and the transitional file stores.

Why a separate repo rather than a template package: **conceptual ownership.**
Agent-specific UI and contracts do not belong in the general application
template — sigil-design must stay meaningful to applications that embed no
agent at all, and the framework should not stay trapped inside one product
fork now that the ecosystem response names Sigil Chat the reference for
embedded agent UI. The dependency direction — template → agent framework →
product — only works as three homes. (Runtime dependencies are a consequence
of this split, not its justification: sigil-agent's core tier is itself
runtime-neutral.)

## Disposition table

### A. Extract back into sigil-design (cherry-pick from this branch)

| Item                                                                                                                                  | Notes                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/graph` — engine delta (`document.ts` + tests, `data-kinds`/`execution`/`socket`/`reducer` improvements, vitest config)      | sigil-design already owns the graph logic package; this is its maturation. Includes the coercion-funnel and `:`-guard fixes. **`builtins` and `sample` are reviewed separately at cherry-pick time** — demonstration fixtures and catalog content may be product/showcase material even though the engine belongs in Sigil. |
| `packages/review` — reworked `decisions-panel`, `review-workbench`, new `annotation-feed`, `revision-history`, `lib/types` extensions | Display-shaped compound components, spec-conformant per review. Tapestry-extraction flow done right.                                                                                                                                                                                                                        |
| `packages/chat` — the four component diffs                                                                                            | General streaming/rendering improvements to the shared chat package. Diff-review at cherry-pick time to confirm nothing eve-specific leaked in.                                                                                                                                                                             |
| `packages/ui` — `text-editor` + test, `registry.json` + `component-meta` entries, `globals.css` line                                  | **Ships as an optional registry item with declared installation dependencies** (the second-lineage reviewer's ruling, adopted): consumers who install `text-editor` pull the three Tiptap deps; every other `@workspace/ui` consumer pays nothing. Component itself is justified (nothing existing does rich inline editing) and SSR-safe.          |

#### A.1 Component-level extractions from `packages/agent` (sigil-first pass)

The litmus applies at component granularity, not package granularity — a
package built for an agent can still contain UI a non-agent app wants.
Verified candidates:

| Component                                                                                                                   | Coupling check                                                                                             | Disposition                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `json-value.tsx`                                                                                                            | Zero agent imports — a generic labelled JSON display over `CodeBlock`                                      | Move to `packages/ui` in sigil-design as-is.                                                                                                                                                                             |
| `agent-dom-effects` (highlight / pulse / dim / spotlight with validated targets, bounded duration, reduced-motion, cleanup) | Implementation is product projection; no second non-agent consumer was found                              | Keep in Sigil Chat behind the neutral client-command boundary. Extract a neutral emphasis primitive only when a real second consumer supplies requirements.                                                                  |
| `AgentHud` shell (floating anchored dock: trigger + panel + detach-to-portal + expand)                                      | Shell is generic; agent-ness is the state encoding (`isBusy`/`pendingApproval` pulses) and attention label | Split: sigil-design gets a **floating-dock/HUD-shell primitive**; sigil-agent core composes it with agent state. Also resolves the detached-anchor spec violation in one move — the shell primitive owns all anchors.    |
| `authorization-card.tsx`                                                                                                    | Approval-shaped props over a generic prompt + options + danger pattern                                     | Judgment call at extraction: genericize into a decision-card primitive only if a second non-agent caller appears; otherwise stays in sigil-agent core.                                                                   |

Chat surfaces already compose `packages/chat` (sigil-design) — no change.

Explicitly NOT extracted to main: `site.ts`/`index.tsx` rebrand, README
(kills the registry landing and ui.nightwork.dev identity — the original
review's finding stands).

### B. Move to a new sigil-agent repository

#### B.0 Internal structure (amended third round — contract-first, hybrid distribution)

```text
sigil-agent/
  packages/core          VERSIONED runtime-neutral contracts + providers:
                         AgentRuntimeSession, AgentMessage, AgentMessagePart,
                         AgentToolCallPart, AgentAuthorizationPart, runtime
                         capability declarations; attention, context
                         drafting/privacy, approval UI contracts + callbacks,
                         the generic domain-outcome envelope/dispatcher,
                         thread summaries/controls/fork intent + provenance.
                         No eve, no ai, no gonk imports — AND no Eve types
                         via re-export.
  packages/eve           VERSIONED Eve adapter, strictly: useAgentSession,
                         translation of Eve sessions/streams/parts INTO the
                         core contracts, Eve cursors/events, fork-packet
                         derivation, the Eve catalog projection. The only
                         package that knows Eve's types exist. No hosting.
  packages/react-query   VERSIONED reconciliation adapter (outcome →
                         invalidation/replacement).
  packages/gonk          VERSIONED authenticated Gonk integration: MCP
                         bearer binding, ApprovalProvider adaptation, and
                         embedded-route helpers. No Gonk server substrate.
  registry/              OWNED-SOURCE visual components: HUD/chat/context
                         tray/tool-call/approval presentation, composed on
                         the core contracts and sigil-design primitives.
  docs/HOST-INTEGRATION  Host responsibility contract and verified-consumer
                         standard. No simulated reference application.
  sigil-chat             REAL product composition: agent host, TanStack Start,
                         local Codex through Eve, authenticated Gonk MCP,
                         persistence, consent, and application state.
```

**Distribution is hybrid, not registry-wholesale** (the second-lineage
reviewer's amendment, adopted): owned source fits visual components a consumer wants to restyle;
it is wrong for security-sensitive contracts, session semantics, and runtime
adapters, which must receive ordinary versioned dependency updates rather
than diverging as copies.

**The extraction is contract-first.** The current components type against
Eve via the hook's re-exports; moving files as-is would ship an Eve-shaped
"core." Define the neutral contracts first, port the components onto them,
then write the Eve adapter as the translation layer. A second turn runtime
then slots in as a sibling adapter without touching core — the point of the
ecosystem's "role, not vendor" ruling.

**Framework ruling (amended): core is React, full stop.** With Router
navigation leaving via the render-prop seam (the HUD's `Expand` currently
imports Router's `Link` directly; at extraction that becomes a
`render`/callback seam) and React Query already in its own adapter package,
no TanStack import remains in core — so no TanStack coupling is declared.
Coupling is declared by actual imports, not by what the current family
happens to use. TanStack lives in `packages/react-query` and consuming apps.

**Approval boundary (narrowed):** core owns approval UI contracts and
callbacks only. The transport header constant, storage key, and persistence
in `tool-approval.ts` are adapter/app policy; and presentation must stop
mutating policy — the "Always allow" button in `tool-call.tsx` currently
calls `setToolApprovalMode("always")` directly (verified), which becomes a
callback the app wires to its consent policy.

**Thread boundary (narrowed):** core owns thread summaries, controls, fork
intent, and provenance. `agent-threads-domain.ts` currently defines the
thread record in terms of Eve's `SessionState` and event stream — that
Eve-shaped half belongs to the Eve adapter (cursors, events, fork-packet
derivation); the app keeps its repository/persistence adapter.

| Item                                                                           | Destination tier                               | Notes                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/agent` components + libs, ported onto the neutral contracts          | packages/core + registry                       | NOT moved as-is: the components currently type against Eve via the hook's re-exports (verified — `authorization-card` consumes `EveAuthorizationPart`). Contract-first port per §B.0. The unused `ai` dependency is dropped.                                                                                                     |
| `use-agent-session.ts` + Eve type translation + Eve session mapping            | packages/eve                                   | The re-exported Eve types stop being public API; the adapter maps them into core contracts.                                                                                                                                                                                                                                      |
| `apps/agent` (channels, connections, instructions, `skills/`, `subagents/`)    | packages/eve + sigil-chat product               | Reusable Eve translation belongs in the adapter; real host composition stays in Sigil Chat.                                                                                                                                                                                                                                       |
| `apps/gonk` — Eve-bound bearer + `ApprovalProvider` + embedded-route composition | packages/gonk + sigil-chat product            | **The generic HTTP/MCP server belongs to Gonk, not here.** Reusable authenticated client integration goes in the versioned package; product mounting and the graph/review registry stay in Sigil Chat.                                                                                                                             |
| `agent-domain-outcomes` split three ways                                       | packages/core / packages/react-query / product | Generic envelope+dedup dispatcher → core (mostly already in `@workspace/agent/lib/client-command`); the React Query invalidation adapter → `packages/react-query`; `reviewDocumentKeys` wiring and legacy command translation stay in sigil-chat. Verified: the current module is review-product code after its generic imports. |
| `agent-catalog` split                                                          | packages/core / packages/eve / registry        | Provider interface → core; the current implementation is an Eve inspection projection with a hard-coded `EVE_ORIGIN` endpoint (verified) → the Eve adapter; catalog presentation → registry.                                                                                                                                     |
| Thread-management UI + thread/fork semantics                                   | core / eve / registry / product                | Thread summaries, controls, fork intent, and provenance → core/registry. Eve `SessionState`, continuation/event persistence, and fork-packet mapping → `packages/eve`. Repository ownership, retention/redaction, CAS, and Gonk/Mirk persistence wiring stay app-side.                                                           |

#### Spec disposition (amended — no duplicate authority)

| Spec                                                                                   | Home                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENT-EMBEDDING, AGENT-CONTEXT-AWARENESS, AGENT-MULTI-SESSION, AGENT-REACT-QUERY-STATE | sigil-agent — these define the framework and its state doctrine.                                                                                                                                                                                                                                                                              |
| AGENT-CONTEXT-MANAGEMENT, AGENT-SKILL-MANAGEMENT, AGENT-RETRIEVAL                      | **Split completed 2026-07-17:** Gonk owns the canonical protocol, persistence, retrieval, and authorization documents; sigil-agent owns three consumer profiles for context, skills, and retrieval. The former mixed Sigil Chat paths are provenance notes only.                                                    |
| GONK-MCP-AUTH-INTEGRATION                                                              | Canonical home is Gonk; sigil-agent links.                                                                                                                                                                                                                                                                                                    |
| GONK-CORE-REVIEW-RESPONSE                                                              | Provenance record, not framework product surface — archives with the review history wherever the canonical specs land.                                                                                                                                                                                                                        |

Distribution: hybrid per §B.0 — versioned packages for contracts/adapters,
owned-source registry (under the ui.nightwork.dev agent namespace) for the
visual components, with `@workspace/ui` primitives as declared registry
dependencies.

### C. Stays in sigil-chat (the product / reference consumer)

| Item                                                                                                                             | Notes                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/` (studio, review), routes, `app-chat`, `agent-sessions`, `review-document.ts`, thread persistence wiring | The demo workspaces and app composition — the first consumer of both repos.                                                                                                                                                                                                       |
| `packages/graph-store`, `packages/review-store`                                                                                  | Explicitly transitional per ecosystem ruling 5: define the repository boundary, share one worktree-internal lock/persistence core, migrate to Mirk when CAS semantics are proven. Promote nowhere. **`review-store` is doubly transitional — see the Deadletters section below.** |
| Rebrand, README, trust-model docs                                                                                                | Product identity.                                                                                                                                                                                                                                                                 |

## Deadletters as the review domain backend

The review workspace hand-rolls Deadletters' core charter: documents,
passages, annotations, decisions, revision history, review lifecycle — all of
which the ecosystem architecture assigns to Deadletters ("versions and
diffs; comments and review lifecycle; typed semantic graph"). `review-store`
is therefore transitional on two axes: its _substrate_ (file KV → Mirk) and
its _domain_ (bespoke review document → Deadletters content + review
capabilities).

What makes the swap cheap later is already true: the review components
(annotation-feed, revision-history, decisions-panel, workbench) are
display-shaped and domain-free, so Deadletters becomes a data-source change
behind the same UI — which would make sigil-chat's review workspace the
first live demonstration of the full stack (Sigil components + Deadletters
domain + agent framework + Gonk operations).

Boundaries that hold regardless:

- **sigil-design (the template) never depends on Deadletters** — the
  dependency enters at product level (sigil-chat) and adapter level (a
  Deadletters-backed `ReviewRepository`; the Deadletters corpus as the
  flagship `native-index` retrieval source, per the ecosystem ruling).
- **Timing caveat:** the Deadletters source-of-truth audit (the Deadletters monorepo vs
  `deadletters-core`) is incomplete; adopt it as the review backend only
  after one canonical home per `@deadletters/*` package exists. Until then
  `review-store` stays the honest placeholder it is.
- Threads/conversations stay operational state (Eve + app repository) —
  promotion of transcripts into Deadletters as durable, searchable content
  is a deliberate later decision per the ecosystem's "promotion from
  operational state into durable meaning must be explicit."

## Sequencing

1. **Fix before extracting — Sigil side.** Land the two HIGH multi-session
   defects (failed-turn state destruction; revision chaining). The review
   document collections already mutate through domain React Query hooks and
   are not a persistence blocker. Separately, replace `PassageEditor`'s
   render-time `setDraft` reconciliation (`review-workspace.tsx` ~742–753)
   with an explicit keyed/reset or reducer boundary that preserves a dirty
   local draft while accepting a newer persisted revision. Ephemeral HUD
   open/detached, selection, and multi-select state may remain local UI state.
2. **Adopt the published Gonk auth contract.** The canonical local registry
   publishes `@gonk/auth@0.1.0`, `@gonk/tool-registry@0.1.0`, and
   `@gonk/tool-registry-mcp@0.1.0`. Remove the obsolete top-level `authorize`
   callback, enforce consent through the registry `ApprovalProvider`, and add
   integration coverage for principal propagation, approval-required
   outcomes, disclosure filtering, and denied orchestrator mutations. The
   extraction gate is compatibility evidence against these artifacts, not
   unpublished Gonk implementation work.
3. Review the two previously-unreviewed items (`agent-domain-outcomes`,
   skills catalog) — the split dispositions above came from a first read;
   they still need the full loop.
4. Cherry-pick lane A into sigil-design (graph first — self-contained logic
   package with tests; then review; then chat; then `text-editor` as an
   optional registry item).
5. Scaffold sigil-agent per the repo recipe with the package/registry
   structure (§B.0). Establish the neutral contracts and Eve adapter tests
   first; then move the registry UI, re-point sigil-chat's imports, and verify
   the worktree still typechecks and tests green against the new seams.
6. **Completed 2026-07-17:** canonical Gonk contract docs remain in Gonk Core;
   consumer profiles live in sigil-agent; the mixed Sigil Chat specs are
   provenance notes.
7. Sigil-chat then becomes an ordinary consumer — and the fork question
   answers itself: the branch never merges to main; it graduates into a
   product repo consuming both.

## Rulings (all resolved)

1. **Name: `sigil-agent`** — clear and correctly subordinate to the Sigil
   presentation family (the second-lineage reviewer, 2026-07-16).
2. **Distribution: the existing `ui.nightwork.dev` surface with a distinct
   agent namespace/catalog** — no second registry service (the second-lineage
   reviewer, 2026-07-16).
3. **`packages/graph` stays in sigil-design** — extract only when a second
   real consumer pulls it (the second-lineage reviewer, 2026-07-16).
4. Tiptap ships as an optional registry item with declared installation
   dependencies (the second-lineage reviewer; both reviewers concur).
5. Component-granularity sigil-first pass (§A.1) and the Deadletters
   review-backend direction added at the maintainer's instruction (2026-07-16).
6. Third-round amendments (the second-lineage reviewer, 2026-07-16, all
   verified and adopted):
   contract-first extraction (neutral core types; Eve types stop being
   public API), hybrid distribution (versioned packages for
   contracts/adapters, owned-source registry for visual components),
   narrowed approval and thread boundaries (no policy or persistence in
   core; no policy mutation from presentation), React-only core with TanStack
   isolated to adapters/examples and navigation behind the render-prop seam,
   spec SPLIT rather than wholesale move, correction of the review-state
   diagnosis, and compatibility proof against the published Gonk artifacts.

This disposition is approved to govern the extraction once the sequencing
gates (Sigil HIGH fixes and compatibility proof against the published Gonk
auth packages) are met. The first extraction task is authoring the neutral
core contracts — nobody moves files before that seam exists.

Execution is coordinated in `./EXECUTION-TASKS.md` (task IDs T1–T22 with
owners, dependencies, acceptance checks, and the claim/review protocol).
