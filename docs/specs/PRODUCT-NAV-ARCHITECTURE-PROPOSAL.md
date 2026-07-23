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
| Run status (idle / streaming / error dot) | `AgentChatHeader` (top rail) **and** `AgentRailStatus` (bottom rail) | The composer send/stop button (revised — see §9.7; top rail keeps only the session title) | Remove from `AgentRailStatus` on the session surface |
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

### 9.7 The composer — one contained box, one control row

Owner input on the built composer: the approval control is orphaned. With
`hideHeader` set (the session surface), `agent-chat.tsx:220` renders the
approval `Select` **alone** in its own `flex … px-3 pt-1.5` row above the input
— the full-width 768×30 strip David inspected ("no reason for an entire empty
row to be consumed by a single toggle"). The fix is not to shrink that row; it
is to **delete it** and seat its one control in the composer's own control row.
David prefers Codex's shape and wants our displays folded in: "I like Codex
better, and we could better incorporate some of our displays / controls in
there."

**Reference read.** Both apps are one contained box, **textarea on top over a
single control row split left/right**. Codex: `+` attach and a `Full access`
approval chip left; run-spinner, model ("5.6 Sol"), mic, send/stop right.
Claude: approval chip, `+`, mic left; model, effort right. Uniform pattern —
one box, one control row, no stray rows.

**Our `ChatInput` already carries the spine.** `packages/chat`'s `ChatInput`
has attach (left) and a send button that already flips to a stop `SquareIcon`
while streaming — so **run state is already expressed at the composer**. What it
lacks is the two-region shape (textarea *over* a control row, not icons flanking
it) and slots to seat app controls. Both are generalizable, so they land in the
shared `ChatInput` (registry loop); Sigil Chat seats its app controls through
the new slots.

**The control row I land on** — one row, inside one box, textarea above:

```
┌──────────────────────────────────────────────────────────┐
│  Ask the agent, or tell it to use an application tool…  ↵ │  ← textarea, full width
│                                                            │
│  ＋   [ Ask ⌄ ]                        Eve · <model>   ➤   │  ← one control row
└──────────────────────────────────────────────────────────┘
     attach  approval                       model      send/stop
     └── left cluster ──┘                   └── right cluster ──┘
```

Every occupant, one home, each traced to §9.4:

| Slot | Control | Source | Notes |
| --- | --- | --- | --- |
| Left | `＋` Add menu (attach files · add from workspace · session note) | `ChatInput` built-in trigger, app-composed contents | the extensible attach entry point — **contents + contract in §9.8** |
| Left | Approval-mode chip (`Ask` / `Always allow`) | §9.4 "approval mode → composer" | reclaims the orphaned row; **color = permission risk** (ask = muted; always-allow = warning/amber, echoing Codex's orange "Full access") — one datum, color means one thing |
| Right | Model label (`Eve · <model>`) | §9.4 "model → composer" | **static label today** (per-thread-fixed model, CLAUDE.md); a **picker-ready slot** for the `MODEL-ADMINISTRATION` draft — leave the slot, don't build the picker |
| Right | Send / Stop (`➤` ⇄ `◼`) | `ChatInput` built-in; **absorbs run status** | see the calls below |

**Deliberate calls on the displays David asked about:**

- **Run status → the send/stop button, not the top rail.** `ChatInput` already
  turns send into a stop `SquareIcon` while streaming; that *is* the run-state
  display, and it is where the interrupt action lives (both references do
  exactly this). This **revises §9.4's run-status row**: its one home is the
  composer send/stop button, and the session top rail drops to the session
  title alone. The interrupt control and the status readout are the same
  affordance — one datum, one home, not two.
- **Collapsed-rail context badge → stays on the rail toggle, NOT the composer.**
  A context count in the control row would duplicate the context rail's own
  readout (§9.4) and crowd the row; neither reference seats context state at the
  composer. Excluded deliberately.
- **Mic → a reserved trailing slot, not an added control.** Both references show
  a mic; we have no voice input today. The trailing cluster leaves room for one
  when voice lands — a noted slot, not an invented control.

**The `＋` is an Add menu, not a bare attach** — the one left-cluster control
(besides the approval chip) that lets capabilities grow without growing the
row. Its contents, the extension contract, and keyboard entry are designed in
**§9.8** (the noun-bar refinement supersedes this section's earlier sketch).

**Implementation steps (dispatchable):**

1. **Restructure `ChatInput` (`packages/chat`) into two regions** — textarea on
   top (full width), one control row beneath, the whole thing a single
   contained rounded box. Keep attach (left) and send/stop (right) as built-ins.
   Generalizable → land it in sigil-design's `ChatInput`; record the extraction
   verdict.
2. **Add control-row slots** to `ChatInput`: `leadingControls` /
   `trailingControls` render regions, left and right of the built-ins, plus
   expose the file-picker open handle (ref or render-prop) so an app-composed
   `＋` menu can trigger attach. No app types leak into the shared component.
3. **Delete the orphaned row.** Remove the `hideHeader && showApprovalMode`
   block at `agent-chat.tsx:220`; pass the approval chip into `leadingControls`
   and the model label into `trailingControls`.
4. **Build the `＋` Add menu** (app-side, in `leadingControls`) per §9.8 —
   contents, the attachable-noun contract, and the `@` keyboard entry are
   specified there. The mechanical hook: the menu's Attach entry calls
   `ChatInput`'s exposed file-picker handle (step 2).
5. **Style the approval chip** with the risk-color rule (muted for ask, warning
   for always-allow) — a chip, not a bare `Select` trigger, to match the
   reference density.
6. **Contain + left-anchor the box** at `max-w-3xl` per §9.3 (the composer box
   shares the conversation's fixed left edge; toggling the context rail never
   moves it). Replace the `border-t` bar treatment with the contained rounded
   box.
7. **Reduce the session top rail** to the session title only (run status now
   lives on the send/stop button, per the revision above).
8. **Verify:** browser desktop + 375px — no standalone approval row; the
   composer is one box with one control row; send flips to stop while streaming;
   approval-chip color tracks mode; model label present. `pnpm --filter web
   typecheck` + `test`. Browser verification is David's.

### 9.8 The `＋` Add menu — attachable nouns, one contract

Owner reference: Codex's `＋` opens an **Add** popover (Files and folders,
Attach, Goal, Plan mode, Record a skill, then a Plugins section: Documents, PDF,
Spreadsheets…). The `＋` is how the composer stays one row while capabilities
grow — a capability becomes a menu entry, not a new button. But the reference
mixes two kinds of thing: **nouns you attach** (Files, Documents, PDF) and
**verbs you invoke** (Goal, Plan mode, Record a skill). Sigil Chat's `＋` menu
takes only the first kind. **The bar is a concrete noun you can attach to the
conversation — not verb-soup.** This is what keeps the menu coherent: everything
in it does the same thing (adds a noun to session context), so it reads as one
menu, not a junk drawer.

**(a) Initial contents** — attachable nouns only, sectioned like the reference,
built only from surfaces we already have:

- **Attach files** — images, PDFs, documents (the existing broad `onAttach`
  accept set in `ChatInput`). Always first; the primary entry.
- **Add from workspace** — a document, resource, or produced artifact from the
  current scope into this session's context: the Evidence Room's documents
  (`demos.evidence`), scoped resources, and artifacts (`artifact-store`). One
  entry that opens a permission-scoped picker of *things visible here*. This is
  the sharpest composer-shaped surface we own — "make the agent consider this
  specific document" is exactly adding a noun to the conversation.
- **Session note** — the per-session scratch note (`SessionBlackboard`, orphaned
  out of the header in §9.4). A single durable document attached to this
  session; the *action* to edit it lives here, its *content* shows in the
  context rail (the attach/attachment-chip split).

**Rejected, by name** (verbs, not attachable nouns — they stay in the
capabilities workspace or the message text):

- **Skill invocation** — REJECTED. "Run skill X" is a verb; the user doesn't
  attach a skill, the agent invokes tools. Discover/read/manage skills in
  `/skills`; to make the agent use one, ask in the message (or pin it later as a
  first-class *prompt* affordance, which is not this menu).
- **Application-tool quick actions** — REJECTED. Same reason: tools are agent
  actions gated by Gonk policy, not nouns a person drops into the conversation.
  A tool launcher in the composer is precisely the verb-soup the bar excludes.
- **Compose modes (Goal / Plan mode / Record a skill, from the reference)** —
  REJECTED for now. These are session-level *modes*, not attachments; if the
  product ever wants them, they are a different control, not the Add menu.

**(b) Extension contract — what earns a `＋` slot.** A candidate qualifies only
when **all** hold:

1. **It is a noun** — a concrete document/resource/artifact/note, not an action
   the agent performs.
2. **It attaches to session scope** — selecting it changes what the agent sees
   for *this* session (adds to context), and it shows as an attachment.
3. **It is visible to the principal** — the picker only offers what the caller
   can already see (scope/permission filtered); attaching never widens access.
4. **It is bounded** — resolves to a single attach or a scoped picker, never a
   browsable/searchable capability catalog.

So: **noun ∧ attaches-to-session ∧ principal-visible ∧ bounded → `＋` menu;
everything else → `/skills` (browse/manage the verbs the agent can perform) or
the message text ("please use X").** The line is clean: **the `＋` menu is where
nouns meet the conversation; `/skills` is where you manage the verbs.** Growth
is adding noun *types* (a new attachable resource kind), not tool launchers — so
the menu can grow indefinitely without ever becoming a command palette.

**(c) Keyboard entry — `@`, not `/`.** One trigger, chosen from the bar, not
both. `@` conventionally *mentions/attaches an entity* (a document, a resource);
`/` conventionally *runs a command* (a verb). Since this menu is nouns-only, `@`
is the honest trigger and `/` would advertise a command palette we deliberately
don't put in the composer. So: typing `@` in the textarea opens the **same** Add
menu inline, filtered to attachable nouns (recent files, workspace
documents/resources, the session note) — `＋` (click) and `@` (type) are two
triggers for one menu, one home. We do **not** build `/`; command/verb affordances
live in the Cmd+K omnibar, not the composer.

**Implementation steps (dispatchable):**

1. **Define the attach-source contract** (app-side): a small typed list of
   `AddSource`s — `files` (built-in), `workspace-resource` (evidence / scoped
   resource / artifact picker), `session-note` (blackboard). Each resolves to an
   attachment the session context accepts. No verbs in the type.
2. **Render the `＋` popover** in `ChatInput`'s `leadingControls` (§9.7 step 2):
   Attach-files calls the exposed file-picker handle; Add-from-workspace opens
   the permission-scoped picker; Session-note opens the blackboard editor.
   Sections mirror §9.8(a).
3. **Wire the `@` trigger** in the textarea: on `@` at a word boundary, open the
   same menu in inline-filter mode over the `AddSource` results; selection
   inserts the attachment (not literal text). Reuse the popover from step 2 —
   one menu, two triggers. Do not implement `/`.
4. **Enforce the contract in code**, not just docs: the picker's query is the
   principal-visible, scoped set (reuse the homes' permission-filtered sources);
   attaching resolves to a context attachment, never a capability invocation.
5. **Verify:** the menu opens from both `＋` and `@`; only attachable nouns
   appear (no tool/skill launchers); a workspace document attaches into session
   context and shows as an attachment; `/` does nothing in the composer;
   `pnpm --filter web typecheck` + `test`. Browser verification is David's.
