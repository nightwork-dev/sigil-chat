---
name: building-in-sigil-chat
description: End-to-end "how to build a feature here" for Sigil Chat — the layer stack, the domain-store-to-UI feature flow, and the conventions that apply to every change. Read this before starting a new feature; it points to the deeper skills (adding-gonk-tools, component-development, extending-this-template) rather than duplicating them.
---

# Building in Sigil Chat

This is the map. Read it before starting a feature, then go to the deeper
skill for whichever layer you're actually touching. If your harness doesn't
expose the other skills named here, treat their file paths under
`.agents/skills/` (or `.claude/skills/` / `.pi/skills/`) as the fallback
reference — the content exists even if your tool can't auto-load it.

## The layer stack

The ecosystem layers, from lowest to highest, are:

```
Mirk         data substrate — storage, fixtures, artifact bytes, lineage
Gonk         capability access, identity/authz, host projection
Sigil        reusable UI/UX + business-logic scaffold
apps         products composing the layers above
```

Sigil Chat is an app in this stack, composing:

- **Sigil Design** (`templates/sigil-design`) — shared graph, review, chat,
  text-editor, SpotlightScrim, and FloatingDock surfaces. Canonical home for
  anything generalizable.
- **Sigil Agent** (`@zigil/agent-*` packages) — neutral agent contracts, Eve
  host adapter, React Query hooks over agent contracts, Gonk registry
  adapter. Consumed as released packages — this repo does not own agent
  runtime logic.
- **Gonk Core** (`@gonk/*`) — context, skills, retrieval, auth, MCP
  contracts.
- **Sigil Chat itself** (this repo) — the real product composition: app
  policy, domain reconciliation, attention projection, sessions, persistence
  wiring. See this repo's `CLAUDE.md`/`AGENTS.md` for the full monorepo
  layout.

Sigil-first rule: if a piece of UI/presentation work can be generalized and
reused, it goes in `sigil-design` first (via the registry, installed as
owned source), then gets carried into Sigil Chat. Domain-semantic UI that
encodes sigil-chat-specific meaning stays app-owned.

## The feature flow (domain store → agent-callable → live UI)

Every real feature in this repo follows this shape. Trace it through the
worked examples below rather than trusting the description alone.

1. **Domain store.** A `packages/*-store` package (or `file-store-core` for
   a new one) owns the persisted shape and repository. Example:
   `packages/review-store` (types + repository consumed by both the server
   and the registry), `packages/work-items-store` — its `package.json`
   `exports` map (`.`, `./types`, `./repository`) is the pattern
   for explicit subpath exports (no barrel `export *`).
2. **Gonk tool.** `apps/gonk/src/registry.ts` composes per-domain
   registration functions from `apps/gonk/src/registry/*.ts` (e.g.
   `registerReviewTools`, `registerStoryTools`, `registerSkillTools`) into
   one `ToolRegistry`. A tool's handler returns `{ data }`, and if it needs
   to update client UI it also returns a `clientCommand` inside `data`. Full
   rules (tiering, visibility, approval, verification) live in the
   `adding-gonk-tools` skill — treat this step as a pointer, not the spec.
3. **Server fn + React Query hooks.** `apps/web/src/lib/*.ts` wraps a
   `createServerFn` around the store/repository and exposes `useQuery`/
   `useMutation` hooks with a key factory. Study `review-document.ts`
   (`reviewDocumentKeys`), `agent-catalog.ts` (`agentCatalogKeys`), or
   `skills.ts` — same shape every time: server fn → typed hook → key
   factory. No inline `useQuery`/`useMutation` in components.
4. **Route + feature components.** A file under `apps/web/src/routes/_app/*`
   (e.g. `_app/review.tsx`, `_app/skills.tsx`) renders the workspace, using
   compound Root/Parts components for any domain object rendered more than
   once. Every route file carries the mandatory ancestor-path +
   chrome-description header comment — copy it from a neighboring route.
5. **The live-reconciliation loop.** `apps/web/src/lib/agent-domain-outcomes.tsx`
   registers handlers keyed by outcome `kind` (e.g.
   `"review.document.changed"`, `"skills.changed"`) — each validates the
   outcome shape and calls `context.invalidate([...queryKeys])` using the
   same key factory from step 3. This is what makes an agent tool-call
   (step 2) refresh the UI (step 4) without polling or a manual refresh.
   When you add a new mutating tool, add its matching outcome handler here.
   This file is a "hot shared file" per the `multi-agent-coordination`
   skill — coordinate before editing it concurrently with another agent.

**Worked examples to read start-to-end, not just cite:**
- Review/annotation: `packages/review-store` → `apps/gonk/src/registry/review.ts`
  → `apps/web/src/lib/review-document.ts` → `apps/web/src/routes/_app/review.tsx`
  → the `review.document.changed` handler in `agent-domain-outcomes.tsx`.
- Work items: `packages/work-items-store` → `registerStoryTools` in
  `apps/gonk/src/registry.ts` → `apps/web/src/lib/work-items.ts` → the
  in-app board.
- Skills catalog: `@gonk/skills` (`FilesystemManagedSkillRegistry`) →
  `registerSkillTools` in `apps/gonk/src/registry/skills.ts` →
  `apps/web/src/lib/skills.ts` → `apps/web/src/routes/_app/skills.tsx` →
  the `"skills.changed"` handler.

## Conventions (every change, every layer)

- **Compound Root/Parts** for any domain object rendered in more than one
  place — Context-provided entity, subcomponents pick what they need. See
  the `component-development` skill before building or extracting one.
- **No `useEffect` for data or derived state** — React Query for data,
  `useMemo` for derived values, route loaders for on-mount work. Legitimate
  `useEffect` uses: event listeners, DOM measurement, third-party
  integration, streaming/interruption plumbing.
- **React Query key factories** — define server fn, query keys, and hooks
  together in the domain lib file (`apps/web/src/lib/<domain>.ts`).
  Mutations invalidate via the same key factory (directly, or via a
  domain-outcome handler for agent-triggered changes).
- **Route header comments are mandatory** on every file under
  `apps/web/src/routes` — ancestor path + chrome description. Prevents
  duplicate-`<main>`/nested-chrome bugs. Copy the format from any existing
  route.
- **No barrel files.** Every package declares explicit subpath `exports` in
  `package.json`. Consumers import the specific subpath
  (`@workspace/chat/components/chat-message`, not `@workspace/chat`).
- **Sigil-first extraction.** Before writing app-local UI, check whether it
  belongs in `sigil-design` first. If a needed atom/molecule/pattern is
  missing there, add it there — don't work around it here.
- **Formatting matches the file you're editing**, not a blanket rule:
  `apps/web`/`apps/gonk` are semicolon-free; `apps/agent` is mixed.

## Where to go deeper

- Adding or changing a Gonk tool → `adding-gonk-tools` skill (tier/
  visibility/approval semantics, the Eve discovery path, `GONK_MCP_KEY`,
  ask-mode consent vs. the `ApprovalProvider` boundary, verification steps).
- Writing or extracting a component → `component-development` skill (Root/
  Parts standard, CVA, decoupling from source-project domain types).
- Adding a route, layout, or top-level section → `extending-this-template`
  skill.
- Rendering a distributable report → `sigil-cli` skill.
- Reviewing a screen for UX quality → `ux-design-language` skill.
- Coordinating with other agents on this repo → `multi-agent-coordination`
  skill.
