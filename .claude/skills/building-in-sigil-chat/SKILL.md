---
name: building-in-sigil-chat
description: End-to-end "how to build a feature here" for Sigil Chat — the layer stack, the domain-store-to-UI feature flow, and the conventions that apply to every change. Read this before starting a new feature; it points to the deeper skills (adding-gonk-tools, component-development, extending-this-template) rather than duplicating them.
---

# Building in Sigil Chat

This is the map. Read it before starting a feature, then jump to the deeper
skill for whichever layer you're actually touching.

## Start the real development instance

From any fresh checkout or linked worktree, run:

```bash
pnpm dev
```

Do not pre-run `pnpm install`, copy or symlink `.env`, migrate auth, seed an
owner, generate a Gonk key, or start the apps separately. The launcher owns
that preparation, proves the authenticated Web → Eve → Gonk path, and prints
the correct branch-namespaced URLs plus a private single-use owner sign-in URL.

Each worktree owns its `.data`, Eve state, credentials, and Portless prefix.
For a clean first-start proof, stop the launcher and use `pnpm dev:reset`; use
the printed `pnpm dev:restore` command to recover the previous instance. The
complete edit and verification loop is in `docs/guides/development.md`.

## The layer stack

The ecosystem layers, from lowest to highest, are:

```
Mirk         data substrate — storage, fixtures, artifact bytes, lineage
Gonk         capability access, identity/authz, host projection
Sigil        reusable UI/UX + business-logic scaffold
apps         products composing the layers above
```

Sigil Chat is an **app** in this stack, composing:

- **Sigil Design** (`templates/sigil-design`) — shared graph, review, chat,
  text-editor, SpotlightScrim, and FloatingDock surfaces. Canonical home for
  anything generalizable.
- **Sigil Agent** (`@zigil/agent-*` packages) — neutral agent contracts,
  Eve host adapter, React Query hooks over agent contracts, Gonk registry
  adapter. Sigil Chat consumes these as released packages; it does not own
  agent runtime logic.
- **Gonk Core** (`@gonk/*`) — context, skills, retrieval, auth, MCP
  contracts.
- **Sigil Chat itself** (this repo) — the real product composition: app
  policy, domain reconciliation, attention projection, sessions, persistence
  wiring. See this repo's `CLAUDE.md` for the full monorepo layout.

## The registry loop (sigil-first, enforced — not a virtue)

Sigil Design is a **registry we consume from and extract into continuously**,
not a lineage note. The loop has two mandatory checkpoints, and a story that
skips either is not done:

**Before authoring any component or hook (step 0 of every feature):**

1. Grep this repo's `packages/ui` — does it already exist here?
2. Check sigil-design's `/showcase` catalog and the registry
   (`pnpm dlx shadcn@latest add @sigil/<name>`) — if it exists there,
   **install it as owned source; do not re-author it.**
3. Only if it exists nowhere: classify it _at creation time_ —
   **generalizable** (any app could want this shape) → author it in
   sigil-design first (+ showcase example), then carry it here; or
   **app-domain** (encodes sigil-chat-specific meaning) → author it here and
   say why in the story.

**Before a story moves to `verify`/`shipped` (the extraction verdict):**
Every story whose diff touches components, hooks, or presentation records one
of four verdicts on the story (frontmatter `extraction:` once S1.5 lands; in
the story body until then):

- `consumed` — reused existing registry/ui components; nothing new to extract.
- `extracted` — the new primitive landed in sigil-design (+ showcase) and this
  repo consumes it.
- `candidate:<X#>` — genuinely generalizable but deferred; an X-story exists
  in the roadmap naming it (a verdict without a story is not a verdict).
- `app-domain` — one sentence on what sigil-chat-specific meaning it encodes.

No verdict → the orchestrator bounces the story back. "I'll extract it later"
without an X-story is the exact failure mode this gate exists to stop.

## The feature flow (domain store → agent-callable → live UI)

This is the shape every real feature in this repo follows — trace it through
the worked examples below rather than trusting a description alone.

1. **Domain store — Mirk, never a bespoke store.** Persistence = a **Mirk store**
   (`platform/mirk` — the charter's storage substrate) behind a thin
   domain repository interface, with a custom Mirk **backend adapter** if
   the physical shape is special (markdown+headmatter, git-per-mutation —
   see `@mirk/store-markdown` direction). Do NOT create a new
   `packages/*-store` hand-rolled store and do NOT extend
   `file-store-core` — the existing store packages (`review-store`,
   `work-items-store`, `graph-store`, `file-store-core`) are **legacy
   precedent, not the pattern**; they migrate to Mirk under consumer pull.
   If Mirk's contract can't express what you need, file a Mirk feature
   request — a gap in Mirk is never a justification for a bespoke store.
   What remains app-owned: the domain _types_ and a repository interface
   (explicit subpath exports, no barrel `export *`).
2. **Application tool.** `packages/agent-tools/src/registry.ts` composes
   per-domain registration functions into one Gonk `ToolRegistry`, hosted
   natively by Eve through `apps/agent/agent/tools/gonk.ts`. A tool's handler
   returns `{ data }`, and if it needs
   to update client UI it ALSO returns a `clientCommand` inside `data`. Full
   rules (tiering, visibility, approval, verification) live in the
   `adding-gonk-tools` skill — don't duplicate them here, just know this is
   step 2.
3. **Server fn + React Query hooks.** `apps/web/src/lib/*.ts` wraps a
   `createServerFn` around the store/repository and exposes `useQuery`/
   `useMutation` hooks with a key factory. Study `review-document.ts`
   (`reviewDocumentKeys`), `agent-catalog.ts` (`agentCatalogKeys`), or
   `skills.ts` — same shape every time: server fn → typed hook → key
   factory. No inline `useQuery`/`useMutation` in components; always import
   from the domain lib file.
4. **Route + feature components.** A file under `apps/web/src/routes/_app/*`
   (e.g. `_app/review.tsx`, `_app/skills.tsx`) renders the workspace, using
   compound Root/Parts components for any domain object rendered more than
   once. Every route file carries the mandatory ancestor-path +
   chrome-description header comment — copy it from a neighboring route, not
   from memory.
5. **The live-reconciliation loop.** `apps/web/src/lib/agent-domain-outcomes.tsx`
   registers `AgentOutcomeReconciliationHandler`s keyed by outcome `kind`
   (e.g. `"review.document.changed"`, `"skills.changed"`) — each one
   validates the outcome shape and calls `context.invalidate([...queryKeys])`
   using the SAME key factory from step 3. This is what makes an agent
   tool-call (step 2) refresh the UI (step 4) without polling or a manual
   refresh. When you add a new mutating tool, add its matching outcome
   handler here — this file is a "hot shared file" per the
   `multi-agent-coordination` skill, so coordinate before editing it
   concurrently with another agent.

**Worked examples to read start-to-end, not just cite:**

- Review/annotation: `packages/review-store` → `packages/agent-tools/src/review.ts`
  → `apps/web/src/lib/review-document.ts` → `apps/web/src/routes/_app/review.tsx`
  → the `review.document.changed` handler in `agent-domain-outcomes.tsx`.
- Work items: `packages/work-items-store` → `registerStoryTools` in
  `packages/agent-tools/src/registry.ts` → `apps/web/src/lib/work-items.ts` → the
  in-app board.
- Skills catalog: `@gonk/skills` (`FilesystemManagedSkillRegistry`) →
  `registerSkillTools` in `packages/agent-tools/src/skills.ts` →
  `apps/web/src/lib/skills.ts` → `apps/web/src/routes/_app/skills.tsx` →
  `"skills.changed"` handler.

## Conventions (every change, every layer)

- **Compound Root/Parts** for any domain object rendered in more than one
  place — Context-provided entity, subcomponents pick what they need. See
  the `component-development` skill before building or extracting one.
- **No `useEffect` for data or derived state** — React Query for data,
  `useMemo` for derived values, route loaders for on-mount work. Legitimate
  `useEffect` uses: event listeners, DOM measurement, third-party
  integration, streaming/interruption plumbing.
- **React Query key factories** — define server fn, query keys, and hooks
  together in the domain lib file (`apps/web/src/lib/<domain>.ts`). Mutations
  invalidate via the same key factory (directly, or via a domain-outcome
  handler for agent-triggered changes).
- **Route header comments are mandatory** on every file under
  `apps/web/src/routes` — ancestor path + chrome description. Prevents
  duplicate-`<main>`/nested-chrome bugs. Copy the format from any existing
  route.
- **No barrel files.** Every package declares explicit subpath `exports` in
  `package.json`. Consumers import the specific subpath
  (`@workspace/chat/components/chat-message`, not `@workspace/chat`).
- **Single browser-facing origin — no direct browser→backend calls.** The
  browser only ever talks to the web app's own origin. Eve is an internal
  service, reached **server-side** through the existing same-origin proxy or
  server functions — never fetched directly from the browser. **If you reach
  for a CORS header on Eve, stop:** that's the
  smell of a browser crossing an origin. Proxy it same-origin instead. This is
  also the deployability posture — only the web app is browser-facing (one
  exposed origin), and principal/authz propagate server-side.
- **The registry loop.** Step 0 (consume-first check) before authoring any
  component/hook; an extraction verdict before the story closes. See "The
  registry loop" above — it is a gate, not a suggestion.
- **Formatting matches the file you're editing**, not a blanket rule:
  `apps/web` is semicolon-free; `apps/agent` is mixed.

## Where to go deeper

- **Adding or changing an application tool** → `adding-gonk-tools` skill
  (native Eve hosting, Gonk policy, approval, and verification).
- **Writing or extracting a component** → `component-development` skill
  (Root/Parts standard, CVA, decoupling from source-project domain types).
- **Adding a route, layout, or top-level section** → `extending-this-template`
  skill.
- **Rendering a distributable report** → `sigil-cli` skill.
- **Reviewing a screen for UX quality** → `ux-design-language` skill.
- **Coordinating with other agents on this repo** → `multi-agent-coordination`
  skill.
