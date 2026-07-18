---
name: building-in-sigil-chat
description: End-to-end "how to build a feature here" for Sigil Chat — the layer stack, the domain-store-to-UI feature flow, and the conventions that apply to every change. Read this before starting a new feature; it points to the deeper skills (adding-gonk-tools, component-development, extending-this-template) rather than duplicating them.
---

# Building in Sigil Chat — hard rules

## RULE 0: Know the layer stack before touching anything

From `/Users/dr/Dev/CLAUDE.md` (authoritative, lowest to highest):

```
Mirk         data substrate — storage, fixtures, artifact bytes, lineage
Gonk         capability access, identity/authz, host projection
Sigil        reusable UI/UX + business-logic scaffold
Deadletters  opinionated knowledge + business logic (builds on Sigil)
apps         products composing the layers above
```

- [ ] Sigil Chat is an **app**: it composes Sigil Design (`templates/sigil-design`,
      canonical home for generalizable UI), Sigil Agent (`@niwork/agent*`
      released packages — do not reimplement agent runtime logic here), and
      Gonk Core (`@gonk/*`). It owns app policy, domain reconciliation,
      attention projection, sessions, persistence wiring.
- [ ] **Sigil-first:** if UI/presentation work generalizes, it goes in
      `sigil-design` FIRST (registry, owned source), THEN gets carried in
      here. Domain-semantic UI stays app-owned.

## RULE 1: Every feature follows the SAME five-step flow — locate your step before writing code

- [ ] **Step 1 — domain store.** `packages/*-store` (or `file-store-core`
      for a new one). Own the persisted shape + repository. Explicit
      subpath `exports` in `package.json` (`.`, `./types`, `./repository`,
      `./sample` — see `packages/work-items-store/package.json`). NO barrel
      `export *`.
- [ ] **Step 2 — Gonk tool.** `apps/gonk/src/registry.ts` composes
      per-domain `register*Tools` functions from `apps/gonk/src/registry/*.ts`.
      Handler returns `{ data }`; if it mutates client-visible state, `data`
      ALSO carries a `clientCommand`. Full rules live in the
      `adding-gonk-tools` skill — go there for tier/visibility/approval,
      don't guess.
- [ ] **Step 3 — server fn + React Query hook.** `apps/web/src/lib/<domain>.ts`
      wraps `createServerFn` and exports `useQuery`/`useMutation` hooks +
      a key factory (`reviewDocumentKeys`, `agentCatalogKeys`, etc.). NEVER
      write an inline `useQuery`/`useMutation` in a component — import from
      the lib file.
- [ ] **Step 4 — route + components.** `apps/web/src/routes/_app/*.tsx`.
      Compound Root/Parts for any domain object rendered >1 place. Mandatory
      ancestor-path + chrome-description header comment on every route
      file — copy an existing one, do not invent the format.
- [ ] **Step 5 — live reconciliation.** `apps/web/src/lib/agent-domain-outcomes.tsx`
      registers a handler per outcome `kind` (e.g. `"review.document.changed"`),
      validates the shape, calls `context.invalidate([...])` with the SAME
      key factory from step 3. THIS is what makes an agent tool-call refresh
      the UI. **If you add a mutating tool in step 2 and skip step 5, the
      agent's change will silently not appear in the UI until manual
      refresh — this is the single most common miss.** This file is a "hot
      shared file" per `multi-agent-coordination` — coordinate before
      editing it concurrently with another agent.

## RULE 2: Read a worked example start-to-end before building a new one

- [ ] Review/annotation: `packages/review-store` → `apps/gonk/src/registry/review.ts`
      → `apps/web/src/lib/review-document.ts` → `apps/web/src/routes/_app/review.tsx`
      → `"review.document.changed"` in `agent-domain-outcomes.tsx`.
- [ ] Work items: `packages/work-items-store` → `registerStoryTools` →
      `apps/web/src/lib/work-items.ts` → the in-app board.
- [ ] Skills catalog: `@gonk/skills` → `registerSkillTools` in
      `apps/gonk/src/registry/skills.ts` → `apps/web/src/lib/skills.ts` →
      `apps/web/src/routes/_app/skills.tsx` → `"skills.changed"` handler.

## RULE 3: Non-negotiable conventions — check every diff against these

- [ ] Compound Root/Parts for any domain object rendered in >1 place. See
      `component-development` skill before building/extracting.
- [ ] NO `useEffect` for data fetching or derived state. React Query for
      data, `useMemo` for derived values, route loaders for on-mount work.
      Legitimate exceptions: event listeners, DOM measurement, third-party
      integration, streaming/interruption plumbing.
- [ ] React Query key factories defined alongside the server fn and hooks in
      the domain lib file. Mutations invalidate via the same factory.
- [ ] Route header comment (ancestor path + chrome description) on every
      route file — mandatory, no exceptions.
- [ ] NO barrel files. Explicit subpath `exports` per package. Import the
      specific subpath, never the bare package name for internal modules.
- [ ] Formatting matches the FILE you're editing, not a blanket rule:
      `apps/web`/`apps/gonk` are semicolon-free; `apps/agent` is mixed.

## RULE 4: Where to go for depth — do not duplicate these here

- [ ] Gonk tool add/change → `adding-gonk-tools` skill.
- [ ] Component write/extract → `component-development` skill.
- [ ] New route/layout/section → `extending-this-template` skill.
- [ ] Distributable report → `sigil-cli` skill.
- [ ] Screen UX review → `ux-design-language` skill.
- [ ] Multi-agent coordination → `multi-agent-coordination` skill (+
      `local-coordination` for machine-local worktree/roadmap state, if it
      exists on this machine).
