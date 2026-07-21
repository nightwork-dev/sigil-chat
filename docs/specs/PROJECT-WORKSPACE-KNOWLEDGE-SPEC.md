# Projects, workspaces, and knowledgebases

> Date: 2026-07-20
> Status: spec — shape ratified by owner (David) 2026-07-20; stories PROJ.1-2,
> KB.1-3 in the roadmap store
> Owner: Sigil Chat product composition; registries land beside the existing
> persona/session machinery
> Related: `AGENT-SESSION-RETENTION-ISSUE.md` (thread records),
> `docs.local/specs/AGENT-MEMORY-WORKSPACE.md` (superseded in part — memory
> shipped on `@gonk/memory` + `@gonk/eve-host`, not the bespoke Mirk collection
> it proposed)

## The owner's framing

> Project [My Game] ← Workspace [My Feature] ← Session

A **project** is a durable body of work with persistent context that outlives
any conversation. A **workspace** is a focused effort inside it. A **session**
is one conversation. Knowledge, documents, and shared memory attach to the
containers, not the conversations — so an agent can be *taught* something once
and have it hold for every session in that container, for every member, not
just the user who said it.

Personas stay orthogonal: *who the agent is* (identity, relationship memory)
is a different axis from *where the work lives* (this hierarchy).

## What already exists (verified 2026-07-20, dev worktree)

- **Scope tiers**: `RESOURCE_SCOPE_TIERS = ["session", "project", "persona"]`
  (`apps/gonk/src/artifact-scope.ts:8`), carried as `x-sigil-scope:
  <tier>:<id>`, enforced by signed per-principal delegation proofs
  (`apps/agent/agent/lib/scope-authorization.ts`, HMAC over `GONK_MCP_KEY`).
  The hard part of scoping is built.
- **A registry precedent**: personas have `PersonaRegistry`
  (`apps/agent/agent/lib/memory.ts`); sessions have immutable ownership
  records (`MirkEveSessionOwnerStore`). `project` is currently a bare string
  with no backing entity — the structural gap this spec closes.
- **Memory**: `@gonk/memory` via `EveMemoryHost` — live, per
  (principal, persona) relationship, automatic per-turn recall under a context
  budget with structured receipts (`sigil-context.ts:98-138`). Right for
  intimacy; deliberately not shared.
- **Skills**: managed skills already span
  `global|persona|project|directory|session` and are injected per turn — the
  existing "teach the agent a procedure" surface.
- **Evidence**: `sigil-evidence-ask` BM25 with exact-quote citations, but its
  corpus is "whatever artifacts sit in scope" and its index is rebuilt per
  call. Real engine, no curated durable corpus.
- **Retrieval**: the `sigil.retrieval` context contributor exists but is
  deliberately unregistered (`sigil-context.ts:264-290` registers only
  skills). It is the intended slot for knowledge injection.

## Design

### 1. Containment on the existing scope machinery

Extend the tier enum by one value:

```
RESOURCE_SCOPE_TIERS = ["session", "workspace", "project", "persona"]
```

Containment is resolved by registry lookup, not encoded in scope ids: a
session record carries `workspaceId`; a workspace record carries `projectId`.
Context resolution for a session walks **session → workspace → project**
(plus persona and global where a resource family supports them), nearest tier
winning on conflicts. Existing `project`-scoped data needs no migration;
`workspace` is additive.

### 2. Registries (PROJ.1)

`ProjectRegistry` and `WorkspaceRegistry`, mirroring the `PersonaRegistry`
pattern: Mirk-backed records, first-boot seed, persisted record authoritative.

- Project: `{ id, name, description, members: [{principalId, role:
  "owner"|"member"}], settings, createdAt/By }`
- Workspace: `{ id, projectId, name, description, status:
  "active"|"archived", createdAt/By }`

Membership is the authorization input: scope-delegation proofs for
`project:<id>`/`workspace:<id>` are only issued to principals the registry
lists (closing today's gap where any authenticated principal can claim any
scope string). Gonk tools: `sigil-project-*` / `sigil-workspace-*` CRUD in
`apps/gonk/src/registry/`, following the story-tools pattern.

### 3. Thread binding and navigation (PROJ.2)

`AgentThread` gains optional `workspaceId` (and derived `projectId`).
The chat surface gains the container chrome: project switcher, workspace list,
threads listed within their workspace. Default: a personal project per user so
the zero-config path still works. Blackboard extends from session-tier to
workspace/project tiers using the same store keyed by scope id — the shared
scratch surface per container.

### 4. Knowledgebase (KB.1)

> **CORRECTED 2026-07-20 (David).** Sections 4–6 below designed an app-side
> knowledge substrate. Gonk already owns that vertical: `@gonk/knowledge`
> (authored pages, FTS keyword query **without embeddings by design**,
> `[[wiki-links]]`+backlinks, supersession-with-provenance,
> private/personal/team visibility on scope tiers, threat-scanned writes,
> threshold-gated passive selection) + the temporal triples graph in
> `@gonk/memory` via `@gonk/memory-tools`. The corrected plan is **adopt +
> compose**, not build: adopt the Gonk contracts, add project/workspace
> authz+visibility **upstream**, build the missing Eve host adapter (passive
> injection + triples + reflector harvest), and keep Sigil to container policy,
> teach/ratify UI, Evidence Room composition, and evaluation. KB no longer
> depends on EMB.1 (knowledge is keyword-first). The authoritative writeup is
> `KB-DESIGN-RECOMMENDATION.md` (CORRECTION section); the restated stories are
> KB.1/KB.2/KB.3. Read the paragraphs below as the superseded build-it framing.

A **knowledge document** is a deliberately authored artifact — distinct from
chat debris: markdown + frontmatter `{ id, scope: {tier, id}, title, tags,
authoredBy, revision, sourceRef? }`, stored via Mirk under the owning tier,
content-addressed history. A **persistent index** (FTS + embeddings, the same
substrate pattern `@gonk/memory` already uses for session transcripts)
replaces per-call index rebuilds; incremental on write.

Gonk tools: `sigil-knowledge-{list,get,upsert,delete,search}` with scope
params, mirroring the skills lifecycle (optimistic concurrency, outcome events
for React Query reconciliation). `sigil-evidence-ask` gains the KB as a
first-class corpus alongside scope artifacts.

### 5. Teaching and recall (KB.2)

Two ingestion paths, one UI surface:

- **Teach in conversation**: "remember this for the project" → the agent
  distills the exchange into a knowledge doc at the named tier (the distill
  machinery already produces structured artifacts with references — reuse it),
  shows the doc as a card for correction/ratification.
- **Author directly**: a Knowledge workspace (resource-manager shell, like
  skills) to write/edit/organize docs per container.

Recall: register the dormant `sigil.retrieval` contributor over the KB index —
per-turn, budget-checked exactly like memory recall
(`contextFitsBudget`), scope chain session → workspace → project (+ persona,
global), with structured receipts so context stays auditable. Explicit lookup
stays available via `sigil-knowledge-search`/`sigil-evidence-ask`.

### 6. Shared memory audiences (KB.3)

Relationship memory stays private. For "the agent remembers this *for the
project*," prefer the KB (auditable, editable, member-visible) as the shared
substrate. Extend `@gonk/memory` audiences from relationship-only to scope
audiences (`{kind: "scope", tier, id}` — project members may recall) only if
the KB proves insufficient for organic accumulation; that extension is
upstream (`@gonk/memory`/`@gonk/eve-host`) contract work and must not fork
app-side.

## Trust model deltas

- Scope proofs become membership-gated (registry-backed) rather than
  possession-gated — a strict tightening.
- Knowledge docs are member-visible by construction; nothing from relationship
  memory flows into a KB without an explicit teach/ratify step.
- Workspace tier inherits the existing artifact-scope property that tier is
  location, not authorization; authorization stays with proofs + membership.

## Sequencing

1. **PROJ.1** — registries + `workspace` tier + membership-gated proofs
2. **PROJ.2** — thread binding + container navigation + tiered blackboard
3. **KB.1** — knowledge store + persistent index + tools + evidence corpus
4. **KB.2** — teach flow + retrieval contributor activation
5. **KB.3** — shared memory audiences (only under proven pull)

PROJ.1 unblocks everything; KB.1 depends on it only for the workspace tier and
membership checks, so the two tracks can overlap after PROJ.1 lands.
