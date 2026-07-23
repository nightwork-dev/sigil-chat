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

> **Superseded in part by §9** (owner verdict on the f9b3c16 build). The
> **context rail survives**; the *centered* column and the deferral of the
> session-list pane do **not** — §9 replaces them with a left-anchored column
> against a persistent session list. Read §9 as the current session-surface
> design; the rest of §3.1 stands for the context rail's rationale.

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

**Standalone `/chat` vs. nested session chat — one rule, because they are one
surface.** The constraint is not "only the standalone `/chat` route": since
`/chat` folds into the session leaf (it resolves to the active session), the
conversation renders in exactly one place — the session leaf — whether reached
by `/chat`, by a canonical `.../sessions/$threadId`, or by a via-prefixed path.
The `max-w-3xl` column and the context rail are properties of that leaf, so the
constraint holds identically everywhere the conversation appears; there is no
second, unconstrained chat surface to keep in sync.

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
   **→ Resolved by owner verdict (§9): the always-on session list is required.
   This question is closed; the pane is in.**

## 9. Addendum — session-surface revision (owner verdict on f9b3c16)

David's browser verdict on the built session surface: "this UI doesn't make a
ton of sense. There's a lot of repeated stuff, and the chat doesn't really
look good centered." He supplied two reference apps he rates better and lives
in daily — Codex and Claude Desktop. This addendum revises the session surface
against that evidence. It **supersedes** two §3.1 calls — the viewport-centered
column and §8's deferral of the session-list pane — and **keeps** the §3.1
session-context rail, which both references corroborate.

The build's three faults, read off the screenshots and confirmed in code:

- **A centered column in a void.** The conversation is `mx-auto`-centered in a
  full-bleed dark field; empty, it reads as unanchored dead space, not
  restraint. Neither reference centers — both hard-anchor the conversation
  against a left list.
- **No persistent session list.** The session list exists only behind a Sheet
  (`AgentSessionSwitcher` in `agent-chat-header.tsx` opens `ProjectWorkspaceNav`
  in a left drawer). Both references keep it always visible as the primary left
  surface. This is exactly the pane §8 deferred — the deferral is overturned.
- **Duplicated chrome.** The context/token cluster and the run-status dot each
  render **twice** — once in the top rail (`AgentChatHeader`) and again in the
  bottom rail (`AgentRailStatus`, whose own comment says it was added "on every
  route" without removing the header copy).

### 9.1 What the references converge on

Both apps are the same three-surface shape, and it is the answer:

```
┌──────────────┬────────────────────────────┬─────────────────┐
│ session list │ conversation               │ context / output│
│ (+ app nav)  │ (LEFT-ANCHORED, prose-capped) │ rail (optional)│
│ pinned +     │                            │ Codex "Outputs" │
│ recents      │ composer owns model + mode │ Claude artifact │
└──────────────┴────────────────────────────┴─────────────────┘
```

- **Left:** a persistent list — pinned + recents — with app nav sharing the
  same sidebar (Codex: New chat / Pull requests / … then Pinned / Recents;
  Claude: Home/Code / New / Artifacts / … then Pinned / Recents). Account at the
  bottom.
- **Center:** the conversation, hard-anchored against the list — never centered.
  Model selector and permission/mode control live at the **composer** (Codex
  "Full access" + "5.6 Sol"; Claude "Accept edits" + "Fable 5 · High"), not in a
  top rail. Top chrome is minimal: session title + a couple of actions.
- **Right:** an **optional** panel for produced outputs / details (Codex
  "Outputs" card + subagents; Claude artifact/diff pane). This is the §3.1
  context rail — the references validate keeping it.

### 9.2 Decision A — persistent session list pane (overturns §8)

The list becomes a persistent left pane, **in the sidebar below the principal
nav**, matching both references (nav + recents in one sidebar rather than a
third column). It is populated by the active container layout from §3: the
**workspace layout** (`workspaces/$workspaceId/route.tsx`) supplies its
sessions; the **project layout** supplies project-level (workspace-less)
sessions. This is the same surface §3 called the lateral-movement affordance —
which is *why* §8's deferral was wrong: the list does double duty (browse +
one-click sibling switch) and it is the visual anchor the conversation needs.
Clicking a sibling swaps only the leaf `Outlet`; the workspace layout and its
list stay mounted.

The component already exists — `ProjectWorkspaceNav`, today rendered only
inside the header's `AgentSessionSwitcher` Sheet. The work is **promotion, not
authoring**: render it as a persistent pane on desktop, keep the Sheet as the
mobile form behind the existing sidebar toggle (the `_app` sidebar is already a
Sheet at 375px). The mobile-375px cost §3 feared is confirmed worth paying by
owner taste.

### 9.3 Decision B — anchoring geometry (left-anchored, never centered)

Kill `mx-auto` on the conversation. The column is **left-anchored** against the
session list and fills the space between it and the optional context rail. The
reading measure is preserved not by centering the column but by capping the
**message content** (prose/bubbles) at a readable width, left-aligned *within*
the column. Geometry, both rail states:

- **Context rail open:** `[ sidebar + list │ conversation (flex-1, prose
  capped ~`max-w-3xl`, left-aligned) │ context rail (fixed ~`w-80`) ]`.
- **Context rail closed:** `[ sidebar + list │ conversation (prose capped,
  left-aligned; the freed width becomes breathing room on the RIGHT plus an
  "open context" affordance where the rail docks) ]`.

The invariant: **the conversation's left edge never moves** when the rail opens
or closes, so toggling context never reflows the reading position, and the
empty state sits in a column anchored against the list — not floating
mid-viewport. This is the direct fix for both "doesn't look good centered" and
the empty void.

### 9.4 Decision C — chrome-dedupe inventory (one datum, one home)

Every place session status / context / tokens renders today, and its single
assigned home:

| Datum | Renders today in | One home | Action |
| --- | --- | --- | --- |
| Run status (idle / streaming / error dot) | `AgentChatHeader` (top rail) **and** `AgentRailStatus` (bottom rail) | Top rail, beside the session title | Remove from `AgentRailStatus` on the session surface |
| Context items + token estimate + focus mode (`ContextTray.Trigger` — "N · focused · ~M tokens") | `AgentChatHeader` (top) **and** `AgentRailStatus` (bottom) | The **context rail** (§3.1) header — it *is* the context surface | Remove from both rails; show a count badge on the collapsed rail toggle |
| Attention subject / "no context" | `AgentRailStatus` (bottom) | The context rail (attention is its content) | Move into the rail |
| Session identity (persona · title) | `AgentSessionSwitcher` Sheet trigger (top) | Active title in the top rail; the list shows all titles | Replace the Sheet trigger with the persistent list (§9.2) |
| Approval mode ("Ask ⌄") + model | Top rail (`AgentChatHeader`) | The **composer**, matching both references | Move to the input bar |
| ⌘K / ⌘B chord hints (`ViewRailChords`) | Bottom rail | Not session data — global, discoverable affordances | Drop from the session surface |

**Net: the session surface retires its bottom status rail entirely.** Both its
occupants either moved (run status → top; context/token/attention → context
rail) or dropped (chord hints). This matches the references, which have no
bottom rail. `AgentRailStatus` stays on **non-session** routes, where it is the
*sole* copy and its "always-visible on every route" intent is honestly served —
the session surface was the one place it was a duplicate.

### 9.5 Implementation steps (dispatchable, §6 style)

1. **Promote the list.** Render `ProjectWorkspaceNav` as a persistent pane in
   the sidebar below the principal nav, fed by the active container layout
   (workspace layout → its sessions; project layout → workspace-less sessions).
   Keep `AgentSessionSwitcher`'s Sheet as the 375px form; drop it as the desktop
   entry point.
2. **Left-anchor the conversation.** Remove `mx-auto`/centering from the chat
   column; cap message-content prose width, left-aligned; column is `flex-1`
   between the list and the context rail. Hold the left edge fixed across rail
   open/close.
3. **Seat the context rail (§3.1).** Host the context/token/attention readout
   (ContextTray content) as the rail's header; count badge on the collapsed
   toggle.
4. **Dedupe.** Remove `ContextTray.Trigger` + the status dot from
   `AgentRailStatus` for the session surface; null out the session route's
   `statusRailStart`/`statusRailEnd` so the bottom rail does not render there;
   move approval-mode + model controls into the composer; reduce the top rail to
   session title + run status.
5. **Preserve `AgentRailStatus` elsewhere.** Confirm it still renders on
   non-session routes (its sole-copy home) and that no route shows the context
   cluster in two places.
6. **Verify.** Browser at desktop and 375px: exactly one run-status voice, one
   context/token readout, conversation anchored hard-left against the list with
   the left edge fixed as the rail toggles, no centered void, list-click swaps
   only the conversation. `pnpm --filter web typecheck` + `test`. Browser
   verification is David's.

### 9.6 What still stands from §1–§8

Unchanged: the nested route tree (§2), layout ownership and mounted-ancestor
lateral movement (§3), the loader/data strategy (§4), breadcrumb orientation
(§5), and the migration spine (§6). §9 revises only the session leaf's internal
layout and the chrome that surrounds it — the routing architecture that makes
the persistent list a mounted, one-click lateral surface is exactly what §2–§4
already specify.
