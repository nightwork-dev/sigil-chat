# Product navigation architecture — nested routes, persistent layouts, containment in the URL

> Author: Neve Laine · Date: 2026-07-23 · Status: Draft
> Answers SC.10 against the route audit baseline; sourced from David's live
> SC.7 demo verdict ("lateral movement, orientation, and switcher mechanics
> feel wrong; it's all a bit too flat").
> Companion to, and the routing half of, [`PRODUCT-HOMES-IA-PROPOSAL.md`](PRODUCT-HOMES-IA-PROPOSAL.md)
> (SC.7). That proposal's three orientation layers and content composition are
> **accepted and preserved unchanged** — this document changes how they are
> routed, mounted, and switched, not what they show.

## 0. The one-paragraph shape

The three homes stop being flat siblings and become **nested route
layouts**: `/projects/$projectId/workspaces/$workspaceId/sessions/$threadId`.
Containment moves from a `?via=` search param into the path itself — the
project you entered through *is* the path prefix. Each container level is a
**layout route** that loads its own data, owns its crumb, and stays mounted
while you move among its children, so switching a session no longer tears down
and refetches the workspace. The breadcrumb becomes a three-level containment
spine derived from route params, and `ActiveContainerProvider` is demoted from
"authority on where I am" (a client-state duplicate of the URL) to "remember
where I was" (the `/home` redirect only). The one `_app` shell is kept and its
breadcrumb slot re-sourced; no rail split. The conversation stops spanning full
width: the session surface becomes a constrained chat column beside a
**session-context rail** (produced artifacts, linked commitments, live
attention) — which also collapses the current `/chat`-vs-Session-home split
into one surface.

## 1. Why the current tree reads as flat

The audit facts, and the mechanism behind each symptom:

- **Zero `Outlet` below `_app`; 22 flat siblings.** `/projects/$id`,
  `/workspaces/$id`, `/sessions/$id` are peers. Navigating session→session or
  workspace→workspace unmounts the entire home tree and mounts a new one.
  Nothing persists, so every move feels like a full page load — this is the
  "too flat" David felt, expressed in the router.
- **Containment absent from the URL.** `/sessions/$threadId?via=$projectId`
  names neither the workspace nor honestly nests inside it; the breadcrumb has
  to *refetch the thread client-side* to discover `workspaceId` and
  reconstruct the chain (`container-breadcrumb.tsx` does exactly this). The URL
  can't answer "what contains me," so chrome does archaeology to compensate.
- **Switcher does double duty.** The breadcrumb switcher both `navigate()`s and
  mutates `ActiveContainerProvider` (a persisted preference). Two writers for
  one fact — "where am I" — is the class that produces "the mechanics feel
  wrong": the URL and the persisted container can disagree, and the split
  label/chevron control exists to paper over it.
- **3/22 loaders; project home waterfalls seven hooks.** `projects.$projectId`
  fires `useProjectWorkspaceNav`, `useAgentThreads`, `useAgentRoster`,
  `useScopeHomeAccess`, `useScopeWork`, `useArtifacts`, `useHomeSignals` inside
  the component `useMemo`, serially gated, with no `validateSearch` and no
  preload — so a warm cache still flashes per-section skeletons.

None of this is the content design (that passed). It is all the routing layer,
and the router already gives us the tools to fix it: `defaultPreload:"intent"`
and `queryClient` in route context are configured in `router.tsx`; we are
simply not using nested layouts or loaders.

## 2. Route tree design

Containment is expressed by directory nesting. Every rendered home sits at its
true depth; the shallow `/workspaces/$id` and `/sessions/$id` forms survive
only as **resolver routes** that redirect deep links into canonical
containment.

```
apps/web/src/routes/_app/
  projects/
    $projectId/
      route.tsx                 → LAYOUT: /projects/$projectId
                                   loads project + access + workspace list,
                                   owns the Project crumb, renders <Outlet/>
      index.tsx                 → CONTENT: Project Home (was projects.$projectId.tsx)
      sessions/
        $threadId.tsx           → CONTENT: a project-level (workspace-less) session
      workspaces/
        $workspaceId/
          route.tsx             → LAYOUT: …/workspaces/$workspaceId
                                   loads workspace + sibling sessions,
                                   owns the Workspace crumb + Shared-from cue,
                                   renders <Outlet/>
          index.tsx             → CONTENT: Workspace Home (was workspaces.$workspaceId.tsx)
          sessions/
            $threadId.tsx       → CONTENT: Session (was sessions.$threadId.tsx)
  workspaces.$workspaceId.tsx   → RESOLVER: redirect to canonical nested path
  sessions.$threadId.tsx        → RESOLVER: redirect to canonical nested path
```

(Layout files use the TanStack directory `route.tsx` form — the directory's own
route — so the layout and its `index` child are unambiguous. The current flat
dotted files are renamed into this tree; `routeTree.gen.ts` regenerates.)

**Canonical (unshared) form.** A workspace's canonical URL is
`/projects/<ownerProjectId>/workspaces/<w>`; a session's is that path plus
`/sessions/<t>`. The prefix is the container chain, full stop.

**Entered-via IS the path prefix.** Enter the same workspace through a
non-owner project P that mounts it, and the URL is
`/projects/P/workspaces/<w>` — P is the prefix because P is how you arrived.
Canonical ownership is no longer a URL fact; it becomes the quiet
`Shared from <Owner>` label on the workspace crumb and home header (SC.7's
accepted ownership cue, unchanged). `?via=` is **retired** as live state.

**Resolver routes (the shallow forms).** `/workspaces/$w` and `/sessions/$t`
keep working for three cases — old links, directly-granted access whose
canonical project is not visible to the principal, and workspace-less personal
sessions. Their `beforeLoad` resolves canonical containment from the
permission-filtered nav (and, for a session, the thread's `workspaceId`) and
`throw redirect`s into the nested path. When **no** containing project is
visible, the resolver renders the home at its shallowest honest depth: a
workspace with an absent Project crumb, a session with absent Project/Workspace
crumbs. This mirrors the nav summary's already-optional `projectId?` and the
existing "directly-granted workspace visible while its project is not" handling
in `active-container.tsx` — the shallow form is the honest home for exactly
that principal, not a placeholder.

**The `?via=` redirect shim.** The two resolver routes carry a
`validateSearch` that still accepts `via`, and their `beforeLoad` maps it to
the prefix:

- `/workspaces/W?via=P` → `/projects/P/workspaces/W`
- `/workspaces/W` (no via) → `/projects/<owner>/workspaces/W` if owner visible,
  else render shallow.
- `/sessions/T?via=P` → resolve `T.workspaceId = W` →
  `/projects/P/workspaces/W/sessions/T` (or `/projects/P/sessions/T` when
  workspace-less).

This is the only place `via` survives, and only as a translation input.

## 3. Layout ownership — what each segment owns and what stays mounted

The outer `_app.tsx` shell is **kept, not split**. It remains the one product
chrome: the icon nav rail (principal-level surfaces — Home, Chat, Roadmap,
Agents, Settings), the persistent `AppAgentSessions` provider, the omnibar, and
the agent HUD. Everything that must survive all container navigation already
lives here and continues to. What changes is that its breadcrumb slot stops
reading `ActiveContainerProvider` and starts reading the matched route chain.

New responsibilities, per new layout:

| Segment | Owns | Stays mounted while… |
| --- | --- | --- |
| `_app` (unchanged) | icon nav, agent session, omnibar, HUD, breadcrumb host | anything below changes |
| `projects/$projectId/route.tsx` | Project crumb + switcher (sibling projects); project container context; workspace list for the Workspace switcher | you move between workspaces/sessions inside the project |
| `workspaces/$workspaceId/route.tsx` | Workspace crumb + switcher; `Shared from` cue; **sibling-session list** for the Session switcher | you move session→session inside the workspace |
| `sessions/$threadId.tsx` | Session crumb; the constrained chat column **and** the session-context rail (§3.1) | — (leaf) |

**This is the lateral-movement fix.** Because the workspace layout is an
ancestor of every session in it, switching session→session swaps only the leaf
`<Outlet/>`; the workspace frame, its loaded data, and the agent session never
rebuild. The same holds for workspace→workspace under a project. The current
flat tree rebuilds all of it on every hop — that is the friction. One-click
lateral movement is delivered two ways, both fed by the layout loaders:

1. **The breadcrumb spine gains its missing third crumb** — Project ›
   Workspace › **Session** — each crumb a label (navigates to that home) plus a
   chevron switcher over its siblings at that level (sibling sessions come from
   the workspace layout's loader). This generalizes the *already-accepted and
   landed* breadcrumb-switcher pattern to three levels; it is compact,
   keyboard-operable, and mobile-safe.
2. **The mounted-ancestor instant swap** — the qualitative change. A crumb
   switch or a link click at any level re-renders only the deepest differing
   segment, warm from the parent loader's cache.

I am **not** adding a persistent session master-detail pane inside the
workspace (a ChatGPT-style always-on session list) as the default. It is the
single biggest lateral surface but a real product change with a mobile-375px
cost, and the breadcrumb session switcher plus mounted-frame swap already make
session-hopping one click without it. Recorded as a rejected default and a
fast-follow candidate in §6.

### 3.1 The session surface: constrained chat column + context rail

David's mid-design input: `/chat` must not span full screen width — it looks
bad, and the side space is usable. The decision is not "add a margin" but "give
the side space real, non-duplicated content," per the design language (fill
horizontal space with *different information or whitespace*, never a second
rendering of what's already there).

The session leaf renders **two regions**: a constrained conversation column
and a **session-context rail** on the side. The column caps at
**`max-w-3xl` (~768px)**, centered when the rail is collapsed. The width is
chosen from the design language's typography register, not by eye: a chat
transcript is reading content (proportional body copy, ≥14px), and an
unbounded line length is the readability failure the register warns against —
`max-w-3xl` holds the measure near the prose optimum (~70–80 characters),
the same reason the empty state already uses `max-w-md`. The current surface
is `max-w-full` (full-bleed), which is exactly what looks bad. The rail is not new content — it is the
SC.7 SessionHome composition (§1.3 of the homes proposal), which today lives on
a *separate* `/sessions/$threadId` page: **produced artifacts**, **linked
commitments** (work explicitly bound to this session), and the agent's **live
attention/context** for this thread. Putting it beside the live conversation
instead of on its own page is the right resolution of a redundancy the flat
tree created — `/chat` and Session Home were two surfaces describing one
session. In the nested tree they are one: the session leaf IS the chat, and its
rail IS the session home. This also retires the `/chat` route as a distinct
destination (it becomes a resolver to the active/newest session under the
active container — see §6), so the product has one session surface, not two.

Why this content and not "breathing room": the conversation column shows the
transcript; the rail shows what the session *produced and is bound to* and what
the agent is *attending to* — strictly complementary, never a re-plot of the
transcript. It earns its width.

Mechanics and constraints:

- **Rail is collapsible**, its own toggle (distinct from the `_app` icon-rail's
  Cmd+B); collapsed, the conversation column stays constrained and centered —
  the width fix does not depend on the rail being open.
- **Mobile 375px**: the rail is not a third column; it drops behind a toggle
  (sheet/stack), conversation full-bleed within its column. This is why the
  persistent sibling-session master-detail (§3) stays rejected — the side space
  is spent on session context, not a second navigation column, and 375px has
  room for exactly one secondary surface.
- **`useRegisterAgentPresentation("full")`** in `app-chat.tsx` currently
  suppresses the shell agent dock because the conversation was the whole
  surface. With the rail present, the session's attention/artifact projection
  moves *into* the rail (the SessionHome sections already render it); the dock
  suppression stays, so there is still one agent presentation on this surface,
  now docked in the rail rather than floating.
- **Attention is an evolving source, not designed here.** The rail's live
  attention section is fed by the existing session attention/projection model
  (`AGENT-SURFACE-COORDINATION-SPEC`). GZ.2 (gaze as an attention source, gated
  on the GZ.1 spike) would eventually feed this same section — noted as a
  downstream input, explicitly **not** designed for in this proposal.

Scope boundary: this constrains the **session/chat** surface only. The other
`_app` workspaces (roadmap, reducer studio, review, agents) keep their own
widths; the width constraint and context rail are a property of the session
leaf, not a global shell change — so DS.3's component-conformance sweep and
this route/layout work do not collide (DS.3 owns component internals; SC.10
owns route and layout files).

## 4. Loader and data strategy

Every container level gets a loader; the seven project-home hooks disperse to
the segment that owns their data. Loaders use
`context.queryClient.ensureQueryData(<domain>QueryOptions(...))` — the
`agentProfileQueryOptions` pattern already in `agents.$personaId.tsx`. With
`defaultPreload:"intent"` already set, hovering any container link prefetches
its loader; entering a home no longer waterfalls.

**Prerequisite refactor (mechanical, no behavior change):** each domain hook
that a loader needs becomes a shared `queryOptions` factory beside its existing
key factory, and the hook is re-expressed on top of it — so loader
(`ensureQueryData`) and component (`useQuery`/`useSuspenseQuery`) share one
definition. Affected libs: `work-items.ts` (`scopeWork`, `scopeHomeAccess`,
`sessionCommitments`), `artifacts.ts`, `home-signals.ts`, `agent-profile.ts`
(roster), `agent-threads.ts` (threads, single thread),
`project-workspace-nav.ts` (nav). Key factories already exist; this only adds
the `queryOptions` wrapper.

Placement of the seven current project-home hooks:

| Hook (today, in the component) | Moves to |
| --- | --- |
| `useProjectWorkspaceNav` | `_app` loader — principal-wide (all projects + workspaces), loaded once, shared by breadcrumb and every home |
| `useScopeHomeAccess` | `projects/$projectId` layout loader — gates the rest; a denial there short-circuits before children load |
| `useAgentRoster` | project layout loader (agents-here) |
| `useScopeWork` | project **home** (`index.tsx`) loader |
| `useArtifacts` | project home loader |
| `useHomeSignals` | project home loader |
| `useAgentThreads` | project layout loader (sessions grouped by workspace) / workspace layout loader (sibling sessions) |

Workspace home and session home loaders follow the same split: the workspace
layout loads workspace + access + sibling sessions; `workspaces/$id/index.tsx`
loads that workspace's scoped work + artifacts + signals; the session leaf
loads the thread + commitments + artifacts. The home *view components*
(`project-home.tsx`, `workspace-home.tsx`, `session-home.tsx`,
`home-view-model.ts`, `live-sources.ts`, `home-states.tsx`) are **unchanged** —
they receive the same resolved shape; only its source moves from in-component
hooks to loader-populated cache read via `useSuspenseQuery`/`useLoaderData`.

**Router context shape.** Context stays `{ queryClient, user }` (from
`__root` + `_app.beforeLoad`). Each layout's `beforeLoad`/`loader` returns the
minimal resolved container descriptor into context for synchronous,
fetch-free orientation:

```ts
// projects/$projectId/route.tsx beforeLoad → adds to context
{ project: { id, name, icon, access } }
// workspaces/$workspaceId/route.tsx beforeLoad → adds
{ workspace: { id, name, icon, status, canonicalOwnerId, enteredViaId } }
```

The breadcrumb reads these descriptors from the match chain — no thread
refetch, no `?via=` parsing, no `ActiveContainer` read. `enteredViaId` is just
`$projectId` from the parent match; `canonicalOwnerId ≠ enteredViaId` is the
whole "Shared from" condition, computed from data already in hand.

## 5. Orientation — chrome + URL answer the three questions

- **Where am I** — the deepest crumb (bolded page crumb) plus the path.
- **What contains me** — the crumb chain, now a *real* containment chain read
  from nested params, not a client reconstruction. The URL alone is legible:
  `/projects/commerce/workspaces/holiday-launch/sessions/abc` says it plainly.
- **Where next** — each crumb's chevron lists siblings at that level (projects,
  workspaces-in-this-project, sessions-in-this-workspace); the home listings
  remain the browse-and-discover surface.

The SC.7 via-path split control **simplifies**: the label navigates to that
crumb's home, the chevron switches siblings, but both are now pure navigation
against the URL — no preference mutation, so the two can't disagree. The
`Shared from <Owner>` chip stays exactly where SC.7 put it (workspace crumb +
home header), now driven by `canonicalOwnerId ≠ enteredViaId` from context.
Mobile: the breadcrumb truncates to focus + one level up with the rest in
overflow (SC.7 rule, preserved); the three-level spine does not add a row.

## 6. Migration + guardrails

Design decisions are all made here; the steps are plumbing, dispatchable to a
non-taste worker in order.

1. **Add `queryOptions` factories** beside existing key factories (§4) and
   re-express the hooks on them. Pure refactor; existing tests stay green.
2. **Create the nested layout tree** (§2): `projects/$projectId/route.tsx` +
   `index.tsx`, `workspaces/$workspaceId/route.tsx` + `index.tsx`,
   `sessions/$threadId.tsx` at both depths. Header comment first on each
   (ancestor chain now includes the new layouts). Move the home view render
   out of the old flat files into the `index.tsx` files unchanged.
3. **Add loaders** to each layout/leaf (§4); delete the in-component waterfall
   from the home routes, replacing the seven hooks with loader-fed reads.
4. **Rewrite `ContainerBreadcrumb`** to derive Project › Workspace › Session
   from the match chain's container descriptors; delete the `?via=` parse and
   the `useAgentThread` reconstruction. Add the Session crumb + sibling-session
   switcher.
5. **Convert the old flat routes to resolver routes** (§2): `workspaces.$id`
   and `sessions.$id` keep `validateSearch({via})`, resolve canonical
   containment, `throw redirect` into the nested path (or render shallow).
6. **Repoint every internal link** to nested paths: `home-target.ts`,
   `container-breadcrumb.tsx` hrefs, home-row hrefs in the home view models,
   the `/home` redirect route.
7. **Demote `ActiveContainerProvider`** to last-visited persistence for the
   `/home` redirect only; nothing that renders the current view reads it as
   authority. Its `selectProject/selectWorkspace` writers stay only as the
   "remember where I was" persist-on-navigate hook.
8. **Fold `/chat` into the session surface** (§3.1): the session leaf renders a
   constrained conversation column + the session-context rail (the SC.7
   SessionHome sections — artifacts, commitments, attention). `/chat` becomes a
   resolver route redirecting to the active/newest session under the active
   container (creating one if none), so there is a single session surface. Keep
   the `useRegisterAgentPresentation("full")` dock suppression; the agent's
   session projection renders in the rail. No width change to other `_app`
   workspaces.
9. **Verify:** `pnpm --filter web typecheck` (routeTree.gen regenerates; bad
   `to=` paths fail as type errors), `pnpm --filter web test`, then the browser
   pass — deep links (canonical, via-prefixed, and old `?via=` shimmed) all
   land; breadcrumb chain correct at each depth; `Shared from` cue intact; the
   session surface shows a constrained (not full-bleed) conversation column
   with the context rail beside it on desktop and behind a toggle at 375×812;
   no horizontal overflow and sub-44px-free targets (SC.7 mobile pass
   repeated). Browser verification is David's.

**SC.7 accepted layers that must stay untouched:** the live-source resolution
(`live-sources.ts`), the agent portrait/headline hover cards
(`agent-home-row.tsx`), the full state matrix (`home-states.tsx`), and the
three home view components + `home-view-model.ts`. They consume resolved data;
this migration only changes where that data is fetched (loader vs hook) and how
the surrounding routes nest. Deep-link, breadcrumb, and ownership-cue behavior
are preserved by steps 4–6; the redirect shim (step 5) is what keeps every
previously-shared link alive.

## 7. Explicitly rejected alternatives

- **Keep flat routes + `ActiveContainer` as the source of truth (the status
  quo).** Rejected: it is precisely what David bounced. Containment stays out
  of the URL, every switch rebuilds and refetches, and the two-writer
  "where am I" bug class persists.
- **Query-param containment (`?project=&workspace=`).** Rejected: not
  canonical or shareable-as-hierarchy, and it keeps the flat re-mount problem —
  it's `?via=` with more params.
- **One mega-layout route that parses the path manually.** Rejected: reinvents
  what nested file routes give for free (per-segment loaders, mounted
  ancestors, typed params) and keeps everything re-mounting on every change.
- **Route loaders with Suspense but bypassing React Query.** Rejected: the
  app's entire state layer is React Query with domain-outcome invalidation —
  agent tool-calls refresh the UI through key factories
  (`agent-domain-outcomes.tsx`). Loaders must *populate* that cache
  (`ensureQueryData`), not run a parallel data path.
- **Persistent session master-detail pane inside the workspace as the default
  lateral surface.** Rejected as default (fast-follow candidate): the strongest
  session-switching affordance, but a genuine product change with a mobile-375px
  cost. The breadcrumb session switcher + mounted-frame instant swap deliver
  one-click lateral movement now; revisit if session-hopping proves frequent
  enough to earn the permanent rail.

## 8. Open questions for David

1. **Persistent session pane (§3/§7):** deferred by default in favor of the
   breadcrumb session switcher over mounted layouts. Confirm that's the right
   call for the demo, or say if the always-on session list is what "lateral
   movement" should mean here — it's the one genuinely product-shaped decision
   in this proposal, the rest is routing mechanics.
