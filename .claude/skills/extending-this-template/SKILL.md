---
name: extending-this-template
description: Use when adding a new route, layout, or top-level section to a project scaffolded from this TanStack Start template (or to this template itself). Triggers on "add a route", "new page", "new layout", "add a section", "showcase route", "nav for this", or when a single route file has grown into a multi-category dumping ground that needs splitting. Also use when adding a new workspace package.
---

# Extending this template

This repo (and anything scaffolded from it) follows one consistent shape for
adding navigable sections. Don't invent a new pattern — find the closest
existing layout route and copy its shape.

## The four chrome shells

There are four top-level layout routes, each a different chrome style. Pick
the one that matches what you're building, don't build a fifth without a
reason:

| Layout | File | Chrome | Use for |
|---|---|---|---|
| Sidebar | `routes/sidebar.tsx` | Collapsible icon sidebar (Cmd+B) + breadcrumb bar | Multi-section apps, dashboards, anything with >4 nav items |
| Footer | `routes/footer.tsx` | Header tab nav + 24px status strip | Chat-first / single-surface apps with a persistent status readout |
| Menubar | `routes/menubar.tsx` | File/Edit/View menubar + tabs | Desktop-app-style tools |
| Showcase | `routes/showcase.tsx` | Same shell as Sidebar | Internal component/dev-tool browser (category-per-route) |

All four are `createFileRoute` layout routes that render `<Outlet />` inside
a shell, with `*.tsx` children in a same-named directory
(`routes/sidebar/*.tsx`, `routes/showcase/*.tsx`). TanStack Router's
file-based routing turns a directory next to `foo.tsx` into `foo.tsx`'s
children automatically — that's the whole mechanism, no extra config.

## Route header comments — mandatory, and read them before editing

Every route file starts with a header block. Before touching ANY route,
read its header — that's the fast path to full ancestor context without
opening every file in the chain:

```tsx
// Route: /sidebar/chat
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/sidebar.tsx      — collapsible icon sidebar + breadcrumb bar + theme picker
//   apps/web/src/routes/sidebar/chat.tsx — THIS FILE
// Content: ChatWorkspace — message list, threading, compose bar (owns its own scroll)
```

Rules:
- **`Tree:` lists every ancestor by full file path**, one line each, with a
  short description of what visual chrome or context that level adds — not
  just the file name. A bare `__root.tsx → sidebar.tsx → sidebar/chat.tsx`
  chain tells you the shape but not what's already rendered above you; the
  path + one-liner means you don't have to open three files to find out
  whether there's already a sidebar, a breadcrumb bar, a status strip, etc.
  before you add your own.
- Mark the current file's own line `— THIS FILE`.
- The last content/chrome line is either `Content:` (a leaf route — names
  the component it renders) or `Chrome:` + `Provides:` (a layout route —
  names what it adds to everything nested inside it).
- **Why this exists**: the single most common route-layer mistake is
  accidental duplicate chrome — a second `<main>` landmark, a second nav
  bar, a nested scroll container inside a scroll container. Reading the
  header before editing catches this before you write code, not after you
  notice it renders ugly. (Concrete instance: `GuideShell` originally
  rendered its own `<main>`, which duplicated the `<main>` already provided
  by `SidebarInset` one level up — the header would have flagged this
  immediately if `GuideShell` had one.)
- When you add a route, write the header first — it forces you to actually
  look at what's above you before deciding what your new file needs to add.
- When you touch an existing route file for an unrelated reason, upgrade
  its header to this format if it's still using the older short form
  (`Tree: __root.tsx → sidebar.tsx → sidebar/chat.tsx`, names only, no
  paths/descriptions) — don't leave it stale, but don't go rewrite headers
  across the repo in an unrelated change either.

## Adding a new section to an existing shell

1. Add a content component in `src/components/<area>/<name>.tsx`. This owns
   ALL state, effects, and animation timers for that section — not the
   route file, not a shared parent. Each route's content component should
   be independently mountable: if you visit just that one page, only its
   own timers/effects should run. (Lesson from this template: a single
   mega-component sharing one `setInterval` across many unrelated demos
   means every page pays the render cost of every demo, and creates render-
   phase ordering bugs between unrelated hooks — see `tweak/commit-handle.tsx`
   vs hotkeys note below for a concrete instance.)
2. Add a thin route file at `routes/<shell>/<name>.tsx`:
   ```tsx
   import { createFileRoute } from "@tanstack/react-router"
   import { ThingShowcase } from "@/components/showcase/thing"

   export const Route = createFileRoute("/showcase/thing")({
     component: ThingShowcase,
   })
   ```
   The route file's only job is wiring — `createFileRoute` + a loader/
   `beforeLoad` if needed. Content lives in the component, not the route.
3. Add a nav entry to the shell's `navItems` array (in `routes/<shell>.tsx`)
   with a label and a `lucide-react` icon. Icons are wayfinding, not
   decoration — pick one that reads correctly at a glance, don't add one
   "for visual interest."
4. If the shell's index route (`routes/<shell>/index.tsx`) doesn't have its
   own real content (e.g. a dashboard), redirect it to the first child
   instead of leaving a stub "pick one" page:
   ```tsx
   export const Route = createFileRoute("/showcase/")({
     beforeLoad: () => { throw redirect({ to: "/showcase/instruments" }) },
   })
   ```
5. Run `pnpm --filter web typecheck` — TanStack Router's typegen regenerates
   `routeTree.gen.ts` (never edit it by hand) and will flag any route path
   typo immediately as a type error on `to=`.

## Adding a brand new top-level shell

Only do this if none of the four existing chrome styles fit. Copy
`routes/sidebar.tsx` (the most common shape) wholesale, rename the route,
and follow the same content/route split above for its children.

## No-slop rule for internal tools

Showcase/dev-tool pages are not marketing pages. Don't add:
- A repeated `<h1>`/description pair on every page — the breadcrumb in the
  shell header already says what page you're on.
- Decorative banners (a scrolling marquee, a hero section) — if a component
  like `Marquee` is itself one of the things being demoed, it goes in an
  `ExhibitCard` like everything else, not as page chrome.
- Generic badges or eyebrow text that don't carry state.

See the `ux-design-language` skill for the full rule on what every visual
element on a page needs to justify — this section is the routing-specific
subset of it.

## Adding a workspace package

Covered in the root `CLAUDE.md` ("Adding a new workspace package") — not
duplicated here. Short version: `packages/<name>/` with its own
`package.json` (`@workspace/<name>`, explicit `exports`), wire it into
`apps/web/package.json` + `tsconfig.json` paths + `globals.css` `@source`,
then `pnpm install`.

## Verifying changes

Always before calling a route/layout change done:
1. `pnpm --filter web typecheck` — catches bad route paths, prop mismatches.
2. `pnpm build` (in `apps/web`) — confirms it actually compiles/SSRs, not
   just typechecks.
3. Load it in a real browser and check the console for errors/warnings, not
   just that the page renders. Render-phase store conflicts (e.g. a hook
   that writes to an external store during render colliding with another
   component's `useSyncExternalStore` read in the same pass) only show up
   as runtime console errors, never as type errors.
