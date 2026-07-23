---
name: extending-this-template
description: Use when adding a new route, workspace, or feature to Sigil Chat's real product surface (the `_app` layout — chat, studio, review, skills, dashboard, canvas, data). Triggers on "add a route", "new workspace", "new page", "add a section", "nav for this", "add a feature", or when deciding whether new UI belongs in a feature directory vs a showcase/gallery/examples demo. Also covers the mandatory route-header-comment convention and adding a new workspace package.
---

# Extending Sigil Chat — hard rules

## RULE 0: There are TWO route trees. Know which one you are in.

`apps/web/src/routes/` contains:

1. **THE PRODUCT** — pathless `_app` layout (`routes/_app.tsx`) plus
   `_app/chat.tsx`, `_app/studio.tsx`, `_app/review.tsx`, `_app/skills.tsx`,
   `_app/dashboard.tsx`, `_app/canvas.tsx`, `_app/data.tsx`.
2. **INHERITED `sigil-design` SCAFFOLD** — `showcase/*`, `gallery/*`,
   `examples/*`, `sidebar.*`, `footer/*`, `menubar/*`, `split/*`,
   `settings/*`, `inspector/*`. Component-catalog and layout-shell demos
   inherited from the template. NOT the chat product. Reference material
   for shell patterns ONLY. May be deleted per
   `docs/guides/trimming-the-template.md`.

**A chat/agent feature request → build under `_app/`. NEVER add product
features to tree #2.** If you catch yourself editing `showcase/*` or
`gallery/*` for a feature request, stop — you are in the wrong tree.

## RULE 1: There is ONE chrome shell, not four

`apps/web/src/routes/_app.tsx` wires `SidebarShell`
(`@workspace/ui/components/layouts/shells`) — this is the only shell this
product uses. Do NOT build a second shell. To add a nav item, edit the
existing `nav` object (`NavModel`) in `_app.tsx` — do not create a parallel
layout route.

## RULE 2: The agent session is provided ONCE, at `_app.tsx` — do not re-instantiate it

`apps/web/src/routes/_app.tsx` mounts `AppAgentSessions`
(`@/components/agent-sessions.tsx`), which wraps
`AgentRuntimeSessionProvider` + `AgentThreadControlsProvider` from
`@zigil/agent-surface`. It is deliberately INSIDE the protected `_app` boundary
(below the `beforeLoad` session check), not at `__root.tsx` — `/login` and
`/setup` are unauthenticated and must never create an Eve client or fetch
channel data (S10.2). This means:
- The agent session persists across `/chat`, `/studio`, `/review`, etc.
  navigation because it lives above the router `<Outlet />`, not per-route.
- A new workspace under `_app/` MUST consume the existing session via
  context/hooks. Do NOT instantiate a second `AgentRuntimeSessionProvider`
  or a second session inside a feature component.

## RULE 3: Every route file MUST start with a header comment — read it before editing, write it before adding

Real example (`apps/web/src/routes/_app/chat.tsx`):

```tsx
// Route: /chat
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell, theme/query providers, shared agent session (no visible chrome)
//   apps/web/src/routes/_app.tsx         — default collapsible sidebar, breadcrumb bar, and theme picker
//   apps/web/src/routes/_app/chat.tsx    — THIS FILE
// Content: AppChat — full-page consumer of the shared embeddable agent session
```

- [ ] `Tree:` lists EVERY ancestor by FULL FILE PATH, one line each, with a
      short description of the chrome/context that level adds. Names alone
      are NOT sufficient.
- [ ] The current file's own line is marked `— THIS FILE`.
- [ ] Last line is `Content:` (leaf route — names the rendered component) OR
      `Chrome:` + `Provides:` (layout route — names what it adds to
      children). `_app.tsx` is the reference for the layout form.
- [ ] Before editing ANY existing route file, read its header FIRST.
- [ ] Before adding a new route, WRITE the header FIRST — this forces you
      to check for existing chrome (a second `<main>`, a second scroll
      container, a duplicate agent session) before you write component code.
- [ ] If you touch an existing route for an unrelated reason and its header
      is stale/missing, upgrade it in the same edit. Do NOT do a
      repo-wide header rewrite as a side quest.

## RULE 4: Route file = wiring only. Content lives in features/ or components/

```tsx
// apps/web/src/routes/_app/review.tsx — the WHOLE file's job
export const Route = createFileRoute("/_app/review")({
  component: ReviewWorkspace, // from "@/features/review/review-workspace"
})
```

- Workspace with real state / multiple parts → `apps/web/src/features/<name>/<name>.tsx`
  (examples: `features/review/review-workspace.tsx`,
  `features/studio/reducer-studio.tsx`, `features/skills/skill-library.tsx`).
- Shared piece → `apps/web/src/components/<area>/` (example: `agent/`
  holds `agent-chat.tsx`, `agent-hud.tsx`, `context-tray.tsx`).
- Providers, layout, and agent-HUD wiring for a workspace live in the
  feature component, NEVER in the route file.

## RULE 5: Adding a new workspace — do these steps in order

1. Create `apps/web/src/features/<name>/<name>.tsx` (or extend an existing
   feature) per RULE 4.
2. Add `routes/_app/<name>.tsx` — header comment FIRST (RULE 3 template),
   then the `createFileRoute` wiring, nothing else.
3. Add a nav entry to `nav.items` in `apps/web/src/routes/_app.tsx` — label
   + a `lucide-react` icon. Icons here are FUNCTIONAL wayfinding (see the
   real entries: `LayoutDashboardIcon`/Dashboard, `NetworkIcon`/Studio,
   `FileCheck2Icon`/Review). Do NOT add an icon "for visual interest."
4. If the workspace must report user selections to the agent (a passage, a
   node, a row), wrap content in `AttentionProvider` from
   `@zigil/agent-surface/attention`. See `docs/guides/building-workspaces.md` and
   `features/review/review-workspace.tsx` for the real pattern. Do NOT
   invent a separate ad hoc mechanism for this.
5. If a Gonk tool result should update this workspace's data, wire a
   domain-outcome handler — see `docs/guides/building-workspaces.md`
   ("domain-outcome loop") and the `adding-gonk-tools` skill. Do NOT poll.
6. Run `pnpm --filter web typecheck` — flags route-path typos in `to=` via
   generated `routeTree.gen.ts` (NEVER hand-edit that file).

## RULE 6: No-slop — mandatory for every product workspace

- [ ] No repeated `<h1>`/description pair — the sidebar breadcrumb already
      states the current page.
- [ ] No decorative banners or marketing chrome. This is an internal agent
      tool.
- [ ] No badge or eyebrow text whose value never changes.

Full rule set: `ux-design-language` skill.

## RULE 7: Adding a workspace package

`packages/<name>/` with its own `package.json` (`@workspace/<name>`,
explicit `exports`), wired into the consuming app's `package.json` +
`tsconfig.json` paths, plus a `@source` line in
`packages/ui/src/styles/globals.css` if it ships Tailwind classes, then
`pnpm install`. BEFORE creating a new package, read
`docs/guides/trimming-the-template.md` — packages like `@workspace/data` and
`@workspace/canvas` only back INHERITED demo routes, not the chat product.
Do not treat their existence as precedent for a new package.

## RULE 8: Verification — run ALL THREE before calling a route/workspace change done

1. `pnpm --filter web typecheck` — zero new errors.
2. `pnpm --filter web test` (vitest) if the change has test coverage —
   `apps/web/src/components/agent/agent-outcome-projector.test.ts` is the
   reference pattern for outcome-handling logic.
3. Load it in a real browser with `pnpm dev` running (starts both
   Portless services — see README service table). Check the console for
   errors/warnings, NOT just that the page renders. If the change touches
   the agent/tool-call loop, this means driving it through
   the app origin printed by THIS worktree's readiness summary with its
   namespaced Eve service live, then invoking a native application tool —
   typecheck alone does NOT exercise the tool-call path.

If any of the three is skipped, the change is not verified.
