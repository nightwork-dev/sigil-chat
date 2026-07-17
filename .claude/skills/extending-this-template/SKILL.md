---
name: extending-this-template
description: Use when adding a new route, workspace, or feature to Sigil Chat's real product surface (the `_app` layout — chat, studio, review, skills, dashboard, canvas, data). Triggers on "add a route", "new workspace", "new page", "add a section", "nav for this", "add a feature", or when deciding whether new UI belongs in a feature directory vs a showcase/gallery/examples demo. Also covers the mandatory route-header-comment convention and adding a new workspace package.
---

# Extending Sigil Chat

Sigil Chat inherited its route tree from the `sigil-design` template, but only
part of that tree is the actual product. Before adding anything, know which
half you're in.

## Two route trees, one repo

`apps/web/src/routes/` holds two unrelated things:

1. **The product** — the pathless `_app` layout (`routes/_app.tsx`) and its
   children (`_app/chat.tsx`, `_app/studio.tsx`, `_app/review.tsx`,
   `_app/skills.tsx`, `_app/dashboard.tsx`, `_app/canvas.tsx`, `_app/data.tsx`).
   This is Sigil Chat: the agentic chat client and its workspaces.
2. **Inherited `sigil-design` scaffold** — `showcase/*`, `gallery/*`,
   `examples/*`, `sidebar.*`, `footer/*`, `menubar/*`, `split/*`,
   `settings/*`, `inspector/*`. These are `@workspace/ui` component-catalog
   and layout-shell demonstrations carried over from the template lineage.
   Per `.agents/index.md`: "Treat it as reference material for the shell
   patterns, not as something to extend for chat features." Don't add chat
   product features here, and don't assume they'll stay in the repo — see
   `docs/guides/trimming-the-template.md` for the deletion recipe.

**If you're adding a chat/agent feature, it goes under `_app/`.** If you're
genuinely just exploring a `@workspace/ui` component's demo shell, the
inherited scaffold is reference material, not a place to build.

## The one real chrome shell: `_app.tsx`

Unlike `sigil-design` (which offers four interchangeable chrome shells), this
product uses exactly one: `SidebarShell` from `@workspace/ui/components/layouts/shells`,
wired in `apps/web/src/routes/_app.tsx`. It's a thin adapter — the only
app-specific thing it supplies is the `NavModel` (brand, nav items, footer
items) and the `ThemePicker` action. Don't build a second shell unless you
have a genuinely different chrome requirement; add a nav entry to the
existing `nav` object in `_app.tsx` instead.

Above `_app.tsx`, `routes/__root.tsx` mounts app-wide providers with no
visible chrome: `ThemeProvider`, `QueryClientProvider`, and — critically —
`AppAgentSessions` (`@/components/agent-sessions.tsx`), which wraps
`AgentRuntimeSessionProvider` and `AgentThreadControlsProvider` from
`@niwork/agent`. This is what "the shared agent session mounts above router
swaps" means concretely: the agent session survives navigating between
`/chat`, `/studio`, `/review`, etc., because it's provided once at the root,
not per-route. A new workspace under `_app/` gets the live agent session for
free through context — it does not need to instantiate its own.

## Route header comments — mandatory, and read them before editing

Every route file in this repo starts with a header block. Read it before
touching the file — it's the fast path to full ancestor context without
opening every file in the chain. Real example
(`apps/web/src/routes/_app/chat.tsx`):

```tsx
// Route: /chat
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx         — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/chat.tsx    — THIS FILE
// Content: AppChat — full-page consumer of the shared embeddable agent session
```

Rules:
- **`Tree:` lists every ancestor by full file path**, one line each, with a
  short description of what chrome or context that level adds — not just the
  file name. This tells you whether there's already a sidebar, breadcrumb
  bar, or provider above you before you add your own.
- Mark the current file's own line `— THIS FILE`.
- The last line is either `Content:` (a leaf route — names the component it
  renders) or `Chrome:` + `Provides:` (a layout route — names what it adds
  to everything nested inside it). `_app.tsx` is the reference for the
  layout-route form.
- **Why this exists**: the most common route-layer mistake is accidental
  duplicate chrome — a second `<main>` landmark, a nested scroll container
  inside a scroll container, a workspace that re-mounts its own agent
  session instead of reading the one `__root.tsx` already provides. Reading
  the header before editing catches this before you write code.
- When you add a route, write the header first. When you touch an existing
  route for an unrelated reason and its header is stale or missing detail,
  upgrade it — don't leave it wrong, but don't go rewrite headers across the
  repo in an unrelated change either.

## Route vs. content component

Every route under `_app/` is a thin wrapper; the actual UI lives in
`apps/web/src/features/<name>/` (for a workspace with real state and
multiple parts — `features/review/review-workspace.tsx`,
`features/studio/reducer-studio.tsx`, `features/skills/skill-library.tsx`)
or `apps/web/src/components/<area>/` (for a shared piece like the `agent/`
components: `agent-chat.tsx`, `agent-hud.tsx`, `context-tray.tsx`). The
route file's only job is `createFileRoute` wiring plus its header comment:

```tsx
// apps/web/src/routes/_app/review.tsx
export const Route = createFileRoute("/_app/review")({
  component: ReviewWorkspace, // from "@/features/review/review-workspace"
})
```

The feature component owns providers, layout, and any agent HUD wiring for
that workspace.

## Adding a new workspace

1. Decide feature vs. shared component (above), then create
   `apps/web/src/features/<name>/<name>.tsx` (or extend an existing feature
   if you're adding to one) or a component under `src/components/`.
2. Add a thin route file at `routes/_app/<name>.tsx`, header comment first:
   ```tsx
   // Route: /<name>
   // Tree:
   //   apps/web/src/routes/__root.tsx      — HTML shell, theme/query providers, shared agent session (no visible chrome)
   //   apps/web/src/routes/_app.tsx        — default collapsible sidebar, breadcrumb bar, and theme picker
   //   apps/web/src/routes/_app/<name>.tsx — THIS FILE
   // Content: <ComponentName> — <one line on what it does>

   import { createFileRoute } from "@tanstack/react-router"
   import { ThingWorkspace } from "@/features/thing/thing-workspace"

   export const Route = createFileRoute("/_app/thing")({
     component: ThingWorkspace,
   })
   ```
3. Add a nav entry to the `nav.items` array in `apps/web/src/routes/_app.tsx`
   with a label and a `lucide-react` icon — these icons are functional nav
   wayfinding (see the real `nav` object: `LayoutDashboardIcon` for
   Dashboard, `NetworkIcon` for Studio, `FileCheck2Icon` for Review, and so
   on), not decoration. Pick one that reads correctly at a glance.
4. If the workspace needs to keep the agent informed of user selections
   (a passage, a node, a row), wrap its content in `AttentionProvider` from
   `@niwork/agent/attention` and report selections through it — see
   `docs/guides/building-workspaces.md` for the full attention/context-tray
   loop and `features/review/review-workspace.tsx` for the real
   implementation.
5. If a Gonk tool result should update this workspace's data, wire a
   domain-outcome handler rather than polling — see
   `docs/guides/building-workspaces.md`'s "domain-outcome loop" section and
   the `adding-gonk-tools` skill for the tool side.
6. Run `pnpm --filter web typecheck` — TanStack Router's typegen regenerates
   `routeTree.gen.ts` (never edit it by hand) and flags any route path typo
   as a type error on `to=`.

## No-slop rule for product workspaces

- No repeated `<h1>`/description pair when the sidebar breadcrumb already
  says what page you're on.
- No decorative banners or marketing chrome — this is an internal agent
  tool, not a landing page.
- No generic badges or eyebrow text that don't carry state.

See the `ux-design-language` skill for the full rule on what every visual
element on a page needs to justify.

## Adding a workspace package

Covered in `.agents/index.md` ("Monorepo layout") and the root
`sigil-design` lineage convention — not duplicated here. Short version:
`packages/<name>/` with its own `package.json` (`@workspace/<name>`,
explicit `exports`), wire it into the consuming app's `package.json` +
`tsconfig.json` paths + `packages/ui/src/styles/globals.css` `@source` if it
carries Tailwind classes, then `pnpm install`. Before adding a new package,
check `docs/guides/trimming-the-template.md` — several existing packages
(`@workspace/data`, `@workspace/canvas`) only back inherited demo routes,
not the chat product; don't assume every existing package is a precedent to
extend.

## Verifying changes

Always before calling a route/workspace change done:
1. `pnpm --filter web typecheck` — catches bad route paths, prop mismatches.
2. `pnpm --filter web test` (vitest) where the change has test coverage —
   e.g. `apps/web/src/components/agent/agent-outcome-projector.test.ts` is
   the pattern for outcome-handling logic.
3. Load it in a real browser against the running Portless services
   (`pnpm dev` starts all three — see the README's service table) and check
   the console for errors/warnings, not just that the page renders.
   Render-phase store conflicts and hydration mismatches only show up here,
   never as type errors. If the change touches the agent loop, drive it
   through `http://sigil-chat.localhost:1355` with the Eve
   (`sigil-chat-agent`) and Gonk (`sigil-chat-gonk`) services also running —
   a route change alone won't exercise the tool-call path.
