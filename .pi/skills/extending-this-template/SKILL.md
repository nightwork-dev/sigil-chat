---
name: extending-this-template
description: Use when adding a new route, layout, or top-level section to a project scaffolded from this TanStack Start template (or to this template itself). Triggers on "add a route", "new page", "new layout", "add a section", "showcase route", "nav for this", or when a single route file has grown into a multi-category dumping ground that needs splitting. Also use when adding a new workspace package.
---

# Extending this template — hard rules

Do not invent a new layout pattern. Do not skip steps. Every rule below is a
requirement, not a suggestion.

## RULE 1: Reuse one of the four existing chrome shells

| Layout | File | Chrome | Use for |
|---|---|---|---|
| Sidebar | `routes/sidebar.tsx` | Collapsible icon sidebar (Cmd+B) + breadcrumb bar | Multi-section apps, >4 nav items |
| Footer | `routes/footer.tsx` | Header tab nav + 24px status strip | Chat-first single-surface apps |
| Menubar | `routes/menubar.tsx` | File/Edit/View menubar + tabs | Desktop-app-style tools |
| Showcase | `routes/showcase.tsx` | Same shell as Sidebar | Internal component/dev-tool browser |

Pick exactly one. Do NOT build a fifth shell unless none of these four fit —
if you think you need a fifth, stop and ask before building it.

Mechanism: a directory next to `foo.tsx` becomes `foo.tsx`'s children
automatically (`routes/sidebar.tsx` + `routes/sidebar/*.tsx`). This is
TanStack Router's file-based routing. Do not add manual route config for this.

## RULE 2: Write the route header block BEFORE writing any other code

Every route file starts with this exact shape:

```tsx
// Route: /sidebar/chat
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/sidebar.tsx      — collapsible icon sidebar + breadcrumb bar + theme picker
//   apps/web/src/routes/sidebar/chat.tsx — THIS FILE
// Content: ChatWorkspace — message list, threading, compose bar (owns its own scroll)
```

Requirements, all mandatory:
- `Tree:` lists every ancestor route file by its FULL PATH, one per line.
- Each line has a one-sentence description of what CHROME that file adds —
  not just its name. If a level adds no chrome, say so explicitly
  ("no visible chrome").
- Mark your own file's line `— THIS FILE`.
- End with either `Content:` (leaf route — name the component + one-line
  summary of what it renders) or `Chrome:` + `Provides:` (layout route —
  name what it adds to everything nested inside it).

**Before writing the header, open and read every file in the Tree.** Do not
guess at what an ancestor renders. If you cannot state exactly what chrome
already exists above your new route, you are not ready to write the route.

**Why this is mandatory, not optional:** the #1 route-layer failure mode is
duplicate chrome — two `<main>` landmark elements, two nav bars, a scroll
container nested inside another scroll container. Writing the header first
forces you to check for this before you write a single line of JSX, not
after a review catches it. A `GuideShell` component in this exact repo
shipped with a duplicate `<main>` because nobody wrote this check down
first — it rendered fine, typechecked fine, and was still wrong.

If you edit an existing route file for any reason and its header is still
the old short form (`Tree: __root.tsx → sidebar.tsx → sidebar/chat.tsx`,
names only, no paths, no descriptions), rewrite it to the new form as part
of your edit. Do not leave it stale.

## RULE 3: One content component per route, route file is wiring only

1. Content lives in `src/components/<area>/<name>.tsx`. This component owns
   ALL state, all `useEffect`, all `setInterval`/`requestAnimationFrame`
   timers for that page. NEVER put page state in the route file. NEVER
   share a timer across two different pages' content components.
   - Concrete failure this prevents: one shared `setInterval` driving
     unrelated demos on different pages means every page pays the render
     cost of every demo whether it's visible or not, and can create
     render-phase ordering bugs between unrelated hooks.
2. The route file contains ONLY: the header comment, `createFileRoute`, and
   a `component:` pointing at the imported content component. Nothing else.
   ```tsx
   import { createFileRoute } from "@tanstack/react-router"
   import { ThingShowcase } from "@/components/showcase/thing"

   export const Route = createFileRoute("/showcase/thing")({
     component: ThingShowcase,
   })
   ```
3. Add a nav entry to the shell's `navItems` array with a label and ONE
   `lucide-react` icon. The icon must be functional wayfinding — a symbol
   that reads correctly at a glance for what the page contains. Do NOT add
   an icon "for visual interest" if the page doesn't need one to be
   findable in the nav list.
4. If the shell's index route has no real content of its own (no dashboard,
   no actual data), it MUST redirect to the first child route. Do NOT leave
   a stub "pick a category" landing page:
   ```tsx
   export const Route = createFileRoute("/showcase/")({
     beforeLoad: () => { throw redirect({ to: "/showcase/instruments" }) },
   })
   ```
5. Run `pnpm --filter web typecheck` after every route change. TanStack
   Router's typegen regenerates `routeTree.gen.ts` — NEVER hand-edit that
   file. A typo in a `to=` path is caught here as a type error; do not skip
   this step and rely on runtime testing to catch it.

## RULE 4: No slop on internal tool pages — explicit forbidden list

Showcase/dev-tool pages are NOT marketing pages. The following are
FORBIDDEN unless the user explicitly asked for them:

- A repeated `<h1>` + description paragraph on every page. The shell's
  breadcrumb already states the current page — do not restate it in the
  page body.
- Any decorative banner: scrolling marquee, hero section, gradient
  splash. If a component (e.g. `Marquee`) is itself one of the things being
  demonstrated, it goes inside an `ExhibitCard` exactly like every other
  demo — it does NOT become page chrome.
- Generic status badges or eyebrow labels that don't carry real state.
  A badge that always says the same static thing is decoration, not
  information — delete it. Only add a badge when it displays a value that
  actually changes (a count, a status, a live value).
- Icon-only decoration with no functional purpose (see Rule 3.3).

If you catch yourself adding a badge, ask: "does this badge's text ever
change based on real state?" If the answer is no, do not add it. See also
the `ux-design-language` skill for the full rule on what every visual
element must justify.

## RULE 5: Adding a workspace package

Full procedure is in the root `CLAUDE.md` under "Adding a new workspace
package" — read it there, do not skip it. Summary: `packages/<name>/` with
its own `package.json` (`@workspace/<name>`, explicit `exports` field), wire
into `apps/web/package.json` deps + `tsconfig.json` paths + `globals.css`
`@source` directive, then `pnpm install`.

## RULE 6: Verification is mandatory before claiming a route/layout change is done

Run ALL FOUR of these, in order, every time. Do not skip any of them and do
not claim completion based on typecheck alone:

1. `pnpm --filter web typecheck` — zero new errors.
2. `pnpm build` (in `apps/web`) — confirms actual compile + SSR, not just
   type-level correctness.
3. Load the route in a real browser.
4. Check the browser console for errors and warnings — not just that the
   page visually renders. Render-phase store conflicts and hydration
   mismatches and duplicate-landmark bugs (Rule 2) do NOT show up as type
   errors or build failures. They only show up here.
