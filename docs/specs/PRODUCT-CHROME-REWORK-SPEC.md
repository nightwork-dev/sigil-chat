# Product chrome rework — Projects as the visible organizing center

> Worktree: `sigil-chat-chrome` (branch `prod1/chrome-rework`, off `dev`)
> Status: **Draft product/UX spec — for David's review before implementation.**
> Builds on: PROJ.1 (registries + workspace tier) and PROJ.2 (thread binding +
> project-aware chat nav), both on `dev`. This is the *product-level expression*
> of that plumbing: the container hierarchy already exists in the domain; the
> shell still presents the app as if it doesn't.
> Taste-bearing lane — match the surrounding Sigil Chat surface, reuse
> `@workspace/ui` components, do not invent chrome.
>
> Scope: **(1)** make Projects/Workspaces the visible frame; **(2)** elevate the
> Cmd+K omnibar to fluid project/workspace/session switching *and* as a direct
> input to the agent (message mode); **(3)** a family of agent chat-panel
> variants — dock / sidecar / inline / omnibar / strip — so the one agent
> conversation can be presented where a surface needs it (around a canvas
> component, beside a focused subject, ambient in the chrome).

---

## The spine (read this first; every section serves it)

**Two principles govern this spec:**

1. **Projects are the frame, features are the content.** The product's center
   is a container hierarchy — Principal → Project → Workspace → Session — not a
   flat cabinet of feature surfaces. The chrome must say so.
2. **The agent is one session with many presentations — and its output can
   escape the transcript.** The conversation is global (the app-global session
   from `_app.tsx`); what varies is *how and where* a surface shows it — dock,
   sidecar, inline, omnibar, or ambient — and whether parts render as chat
   lines or as **canvas projections** (annotations, highlights, ambient text).
   One active presentation per region; never two.

Every workstream is judged against both. Anything that adds a feature surface
or a *second agent session* without serving them is out of scope (see
Non-goals).

---

## 1. Why now — what the fresh-eyes review got right

A read-only review (2026-07) concluded Sigil Chat "became a product while the shell still presents it as a cabinet of subsystems." The load-bearing observations, each **verified against source in this worktree**:

1. **The center is hidden.** Global nav gives every feature surface equal rank
   (`app-nav.ts:21` — `Chat, Agent, Capabilities, Studio, Evidence, Artifacts,
   Review, Skills`). Projects and Workspaces exist only inside the conversation
   drawer (`project-workspace-nav.tsx:29`, mounted at `agent-chat.tsx:539`).
   There is no create-container or move-thread UI (confirmed in
   `PROJ2-NOTES.md` divergences #4 and #5).
2. **The Agent surface lies to non-owners.** The roster invites every user to
   "inspect identity, memory, and sessions" (`agents.index.tsx:31`) and links
   every persona to `/agents/$personaId`, whose server fn is owner-only
   (`agent-profile.ts:84` — `requireOwner`). A non-owner sees the list, clicks,
   and lands on "Owner access required."
3. **Old architecture is visibly doubled.** `review-workspace.tsx:703` mounts its
   own `AgentHud.Root`; `shell-agent-hud.tsx:23` mounts another on every non-
   `/chat` route. On `/review` both render → two "Ask your agent" controls.
   `capabilities-workspace.tsx:61` emits a native-button-semantics warning from
   a `<Button render={<Link/>}>`.
4. **The written record is stale.** `README.md:175` calls threads
   "deployment-global … no per-user owner," but `agent-threads-domain.ts:141`
   filters by `isMember(thread.members, userId)` and threads carry
   `members: string[]`. `FEATURE-ROADMAP.md:35` lists agent/skill/permissions/
   memory management as "Requested," though most now ship.

### One correction to the review — the branch state

The review's finding #3 ("no single branch contains product truth; dev has 121
commits absent from main") is **stale at the current state.** Verified:

- `main..dev` = **0** (dev has no commits absent from main)
- `dev..main` = **6** (main has six cleanup commits absent from dev)
- `dev IS ancestor of main` → **`main` is a strict superset of `dev`**

So `main` already *is* the single branch of product truth (it contains all of
dev plus the orphaned-canvas removal, dead-code cleanup, doc grounding, and
public-registry pinning). The review was written before that integration landed.
**Implication for this work:** the spec branches off `dev` (team convention;
`proj1`/`proj2`/`evidence-room` all do), but any *implementation* that touches
package deps or the canvas removal should rebase onto `main` first to avoid
duplicating the six cleanup commits. Flagged here so it isn't rediscovered mid-
build.

---

## 2. The reframe — a two-level chrome

Today the shell is one flat list. The reframe splits it into two levels that
mirror the real domain structure:

```
Principal ─┬─ Projects  (multi-user containers)            ← LEVEL 1: CONTEXT
            └─ Workspaces (containers within a project)        visible on every route,
                                                              owns the "where am I"
                                                              frame
                                                              │
              Chat · Evidence · Studio · Review · …        ← LEVEL 2: SURFACE
                                                              modes of working
                                                              WITHIN the current
                                                              project/workspace
```

Feature surfaces (Evidence, Studio, Review, Artifacts, …) are **not peers to
the project** — they are *what you do inside* the selected project/workspace.
The chrome must stop ranking them as equals with the container.

**Design principle (the discriminator for every decision below):** *context is
persistent and global; surface is local and switchable.* If a control changes
*which project/workspace I'm in*, it lives in Level 1 (chrome, every route). If
it changes *what I'm doing here*, it lives in Level 2 (the feature nav).

---

## 3. Target chrome model

### 3.1 Project/Workspace switcher — a new chrome slot

The portable shell contract (`packages/ui/.../layouts/shells.tsx`,
`layouts/nav.tsx`) is deliberately app-agnostic: `SidebarShell({ nav, actions,
children, accountMenu })` — second regions are added as **one named slot each**
(the `accountMenu` precedent at `shells.tsx:129`). Project context enters the
same way: **a new optional slot, composed in the app layer (`apps/web`), never
inside the portable `@workspace/ui` package.**

- **New slot:** `SidebarShell` gains `workspaceSwitcher?: ReactNode`, rendered in
  the sidebar header above `nav.items`. The shell renders the slot and nothing
  of its content (stays portable); `apps/web` authors the switcher.
- **Switcher content:** a compact `Project ▸ Workspace` affordance (reuse the
  existing `Select`/`Sheet` primitives already in `project-workspace-nav.tsx`).
  Clicking opens a picker: project list → workspace list under the chosen
  project → "Create project/workspace" affordance (gated, see §6).
- **Selection is global.** Resolved through a new app-level context
  (`ActiveContainerProvider`) that wraps `Outlet` in `_app.tsx`, sibling to the
  existing `AgentPrincipalProvider` / `WorkspaceAttentionProvider`. Every route
  reads the active project/workspace from this context instead of each surface
  re-deriving it.
- **Persistence.** Active project/workspace is a per-principal preference
  (extend the existing active-thread-preference store; do **not** fork a second
  preferences store — match the PROJ.2 blackboard "same store, keyed by scope"
  rule).

### 3.2 Feature nav — re-scoped, not removed

`app-nav.ts` keeps its shape but the *meaning* of each entry changes: surfaces
are now implicitly scoped by the active container from §3.1.

- `/chat` → threads in the active workspace (the conversation drawer's project
  filter becomes the *default*, not a hidden control).
- `/evidence`, `/artifacts`, `/review` → scoped to the active project (the
  container is the natural read boundary these surfaces already want).
- `/agents`, `/capabilities`, `/skills`, `/studio` → these are *principal-level*
  (agent definitions, tool catalog), not container-scoped. They stay in the nav
  but the chrome makes the scope distinction legible (see breadcrumb §3.4).

This is a naming/grouping pass on `buildAppNav`, not a route rewrite. Routes
themselves don't move; what changes is *what "current" means* on each.

### 3.3 Omnibar elevation — the fluid-switching primitive

`ShellOmnibar` (`shell-omnibar.tsx`) is already described as "the keyboard-first
entry tier" but today searches only the flat `appNav.items`. It becomes the
primary **fluid switching** surface across all three container tiers:

```
Cmd+K / "/"
  ├─ Switch project…        (Level 1)
  ├─ Switch workspace…      (Level 1, under active project)
  ├─ Jump to session…       (Level 2 — threads in active workspace)
  ├─ Go to surface…         (Chat / Evidence / Review / …)
  └─ (later) Find skill / artifact…
```

Reuse the `Command`/`CommandGroup` primitives already in the file. The
project/workspace/session lists come from the same `useProjectWorkspaceNav` +
`useAgentThreads` hooks the drawer already uses — no new data path, just a
second render site. (When it gets a second render site, promote
`ProjectWorkspaceNav` to a Root/Parts compound per the repo's own rule —
`PROJ2-NOTES.md` divergence #2 already anticipates this.)

**Message mode — the omnibar is also an input, not just a jump.** Today Cmd+K
only navigates. Add a compose path: a free-text entry (distinct from selecting
a result) sends to the agent through the app-global session, with the active
workspace's attention attached, and the response promotes into the active
region's presentation (§3.6) — the dock by default, or the sidecar/inline a
surface has already opened. The shell's own header comment already anticipates
this ("a 'message the agent' mode that sends through the shell session
(ShellAgentHud) with the active workspace's attention, then promotes into the
floating panel"). Implementation: the `Command` palette gains a submit-on-Enter
path for non-matching text that calls the same `session.send` the dock composer
uses, then opens the active presentation. **No second session, no second
transport** — the omnibar is an entry tier to the one conversation, like the
dock. (Skill/story search stays a later increment, per the same comment.)

### 3.4 Breadcrumb — make "where am I" legible

The shell already renders a `Breadcrumb` (`shells.tsx`). Extend it to express
the container chain: `Project › Workspace › [Surface]`. This is the cheap,
high-signal way to make the reframe visible on every route without redesigning
each surface. It also disambiguates the principal-level surfaces (§3.2) —
`/capabilities` shows no container in the crumb because it isn't scoped to one.

### 3.5 Session switching — faster than the drawer

Today switching sessions requires opening the conversation sheet. Add a lighter
path:

- The omnibar's "Jump to session" group (§3.3) — keyboard-first, the default.
- A compact session indicator/switcher in the chat surface header (reuse the
  existing `AgentSessionSwitcher`, surfaced as a popover rather than only a
  full sheet) for pointer-first users.

The full sheet (`ProjectWorkspaceNav`) stays for browsing/reorganizing; the new
paths are for *fast switching*, which is the explicit ask.

### 3.6 Agent presentation variants — one session, many presentations

The agent is a single conversation (the app-global session), bound to a subject
through `AttentionProvider`. What varies is *how* a surface presents it. Today
there is exactly one presentation — the floating `AgentHud` dock. The ask: a
family of less-intrusive, inlinable presentations so any surface can place the
agent where it belongs (around a canvas component, beside a focused subject,
etc.).

**The seam already exists — this is extraction, not greenfield:**

- `AgentHudConversation` (`packages/ui/src/components/agent-hud.tsx`) is the
  embeddable core — transcript + composer + thread controls + approvals +
  `AgentContextInline` (the subject binding). It already reads
  `useAgentRuntimeSession()` + `useAttention()` from context, and hosts can
  already swap it in via `AgentHud.Panel` children.
- `AgentHud = { Root, Trigger, Panel }` is a *thin shell over `FloatingDock`*
  (`packages/ui/.../floating-dock.tsx`) — i.e. the dock is **one**
  presentation of the conversation, not the conversation itself.

So the work is **not "build N chat panels."** It is: lift the one shared core,
ship a small set of presentation shells around it, and expose them through a
registry so any surface composes `<AttentionProvider context={subject}>
<VariantShell/></AttentionProvider>` without reimplementing.

**Variant set (the demos):**

| Variant | Presentation | Lives in | Intrusiveness |
|---|---|---|---|
| `dock` *(exists)* | floating, detachable bottom-right | shell, every route | on-demand |
| `sidecar` | persistent in-flow panel beside a focused subject (split-pane companion) | a surface's own layout (Review's right rail; a focused artifact view) | persistent, contextual |
| `inline` | transient, anchored to a target element/selection | "around a component in a canvas"; popover on a selection | transient, scoped |
| `omnibar` | the Cmd+K input *is* the entry; response promotes into the region's active presentation | the shell omnibar message mode (§3.3) | transient, keyboard |
| `strip` *(optional)* | slim read-only rolling digest in a chrome edge | sidebar foot / status strip | ambient |

Each variant wraps the same `AgentHudConversation` (or a slimmer composer for
`omnibar`/`strip`) and differs only in chrome: positioning, persistence, and
how much transcript it shows. **Subject binding — not chrome — is the
differentiator:** `sidecar` and `inline` only make sense attached to a subject,
which is exactly what `AttentionProvider` is for; the shell `dock` has the
workspace's default attention or none.

**Registry + showcase (sigil-first).** These are reusable presentation
patterns, so they belong in `@workspace/ui` alongside `AgentHud`/`FloatingDock`,
exposed as a small registry (name → shell component). Any surface then declares
"inline the agent here, as a sidecar" without owning the conversation. The
**demo David asked for is the Sigil Storybook iterating that registry** — each
variant as an exhibit against a mock session + mock attention, presentable in
isolation (the forge-storybook / ExhibitCard pattern). Building the showcase is
part of the deliverable, not an afterthought: a variant that can't be shown in
isolation can't be chosen by a surface author either.

### 3.7 Agentic HUDs & agent-emitted projections — pointer

The full design lives in its own companion spec:
**[`AGENT-OUTPUT-PROJECTION-SPEC.md`](AGENT-OUTPUT-PROJECTION-SPEC.md)** (Q6 —
agreed: projection is conceptually prior to chrome, so it graduated to a
sibling of `AGENT-CONTEXT-AWARENESS-SPEC.md`).

In one line: **agent output can escape the transcript and live on the canvas.**
A tool-call whose `output` carries an anchor + body is rendered by the host as
an overlay instead of a transcript line — not a parallel channel, an extension
of the rendering rule (the `@zigil/agent-surface` contract already makes
rendering host-owned). The design covers three layers — a part-projection
registry, agent annotation tools (`sigil-annotate`/`pin`/`highlight`), and
overlay + ambient primitives (`AnnotationOverlay`, `AmbientPanel`) — and anchors
annotations to **attention items** (Q7 — agreed: unify what the agent sees
with what it annotates).

**Why it's referenced here, not duplicated:** the projection model and the
variant family (§3.6) compose. A presentation variant is defined by *which
projectors it enables and where it renders them*, not just its chrome — the
`dock` enables the `inline` projector + composer back-channel; a `sidecar` /
`inline` variant enables the `overlay` projector over a bound subject; the
ambient panel enables the `ambient` projector. The variant picks the *region*;
the projector picks *how parts render in it*. The two specs are peers; neither
owns the other.

---

## 4. Consistency pass — fix the doubled and the broken

### 4.1 One *active presentation* per region (was: "one HUD")

The doubled-HUD bug on `/review` is really a missing rule, and the variant
family (§3.6) makes the old framing too narrow. Review doesn't want *zero*
agent UI — it wants a **sidecar** beside the passage, not a floating dock *and*
a floating dock. The rule becomes: **at most one agent presentation is active
per region of the screen.**

**What is a region? (Kimi #1 — load-bearing definition.)** A region is a
**layout slot the shell owns**, not a route and not an arbitrary screen
rectangle. Concretely: the sidebar slot, the main-content slot, the **shell
floating/dock slot**, and each open modal/overlay's slot are regions. Regions
key off the **layout**, so the suppression rule is structural, not path-based.
This resolves the ambiguous cases:

- A surface opening an **inline variant on a selection** while the **shell
  dock** is visible = **two regions** (the inline lives in the main-content
  slot; the dock lives in its own floating slot). Both may be active — §3.6
  wants exactly this.
- The `/review` bug is **one region with two presentations** (the shell dock
  *and* the review HUD both claim the floating slot) — that's the collision the
  rule forbids.
- A modal's agent panel is its own region; it does not collide with the dock.

The regression test is written against this invariant: count active
presentations per **shell-owned slot**, not per route or per DOM subtree.

- The shell mounts the `dock` everywhere, and suppresses it on any route whose
  region owns a fuller presentation (generalize the current `/chat`-only
  suppression to "this region has its own presentation").
- Review drops its local `AgentHud.Root` (`review-workspace.tsx:703`) and
  instead composes a `sidecar` (§3.6) bound to the selected passage via the
  `AttentionProvider` it already builds (`review-workspace.tsx:470` constructs
  `attention` from `selectedPassage`). The passage-aware placeholder flows from
  attention, not from a second mount.

Acceptance: no region renders two agent presentations; `/review` shows one
sidecar (not a dock + a floating HUD); the passage-aware placeholder is
preserved; the generalized suppression has a regression test that goes red if
a second presentation mounts in a region that owns one.

### 4.2 Button/Link semantics

**Problem:** `capabilities-workspace.tsx:61`
(`<Button render={<Link to="/settings" …/>}>`) emits a native-button-semantics
warning — nested interactive elements from the `render`-as-`Link` composition.

**Fix:** use the established `Button` + `Link` composition pattern that the rest
of the app uses without the warning (audit sibling call sites for the correct
form; the `render` prop should yield a single interactive element, not a
`<button>` wrapping an `<a>`). Sweep all `<Button render={<Link/>}>>` sites in
one pass — this is a class, not a one-off.

Acceptance: no native-button-semantics warning on `/capabilities` (or anywhere
else); a grep audit confirms no remaining sites.

### 4.3 Non-owner Agent projection — stop lying

**Problem:** the roster is visible to every authenticated user
(`listPersonas` uses `requireSession`, not `requireOwner`) and links every
persona to an owner-only destination (`fetchAgentProfile` → `requireOwner`).
Non-owners hit a wall.

**Two coherent options — pick one (Open question Q1):**

- **(A) Reduced projection.** Add a non-owner `fetchAgentProfilePublic` that
  returns identity + description + portrait but **not** memory/sessions. The
  roster stays visible to all; the destination adapts to role. Matches the
  review's "deliberately reduced projection" recommendation and the product's
  multi-user direction.
- **(B) Owner-only roster.** Gate `/agents` behind `requireOwner` at the route
  loader; non-owners never see the surface. Simpler, but contradicts the
  multi-user framing the rest of this spec builds toward.

Recommend **(A)** — it's the only option consistent with treating containers as
genuinely multi-user (finding #2's release boundary).

---

## 5. Authorization boundary — the prerequisite, called out

This spec is UI/UX, but one non-UI gate controls how much container-management
UI is safe to ship: **registry-mutation authz is unresolved.** Per
`PROJ2-NOTES.md` point 6 and PROJ.1's known issues, the Gonk container tools
(`apps/gonk/src/registry/containers.ts`) expose global project listing,
inspection, and replacement **without checking the current principal's
membership.** `PROJ2-BUILD-BRIEF.md` is explicit: "do not build PROJ.2 to depend
on registry-mutation authz guarantees that aren't yet enforced."

**Scope rule for this spec:**

- **Read + create-for-self is safe now.** `createAgentThreadFn`'s workspace
  check and scope proofs use the read-path `assertRegisteredScopeMembership` /
  `assertAuthorizedScope`, which are sound. The switcher (§3.1) and omnibar
  (§3.3) — which only *list* containers the user is a member of — are shippable.
- **Member management, project replacement, and cross-principal mutation are
  NOT in scope** until `containers.ts` enforces principal membership on
  mutations. The "Create project/workspace" affordance in §3.1 is limited to
  *self-membership* creation (the personal-project seed precedent) and is
  explicitly **not** an invite/member-management surface. That lands in a
  follow-up spec gated on the authz fix.

This keeps the chrome rework unblocked while honestly representing the
authorization seam as a release boundary, not a TODO to quietly exceed.

---

## 6. Anchors (file:line — the implementation map)

**Chrome contract (portable — extend, don't pollute):**
- `packages/ui/src/components/layouts/nav.tsx` — `NavModel` / `NavItem`. Adding
  container context does **not** touch this; it enters via a shell slot.
- `packages/ui/src/components/layouts/shells.tsx:129` — `SidebarShell({ nav,
  actions, children, accountMenu })`. Add `workspaceSwitcher?` slot here, mirror
  `accountMenu`.
- `apps/web/src/routes/_app.tsx` — compose the switcher + `ActiveContainerProvider`
  here, sibling to `WorkspaceAttentionProvider` / `AgentPrincipalProvider`.

**App nav + chrome (app layer — the reframe lives here):**
- `apps/web/src/lib/app-nav.ts:21` — `buildAppNav`. The grouping/scope pass (§3.2).
- `apps/web/src/components/agent/shell-agent-hud.tsx:23` — single-HUD owner (§4.1).
- `apps/web/src/components/agent/shell-omnibar.tsx` — omnibar elevation (§3.3).
- `apps/web/src/components/agent/project-workspace-nav.tsx:29` — existing switcher
  logic to lift into the chrome slot + promote to compound at second render site.

**Domain (already membership-aware — reuse, don't re-derive):**
- `apps/web/src/lib/agent-threads-domain.ts:141` — `isMember` filter (threads are
  scoped; the README claim is wrong).
- `apps/web/src/lib/project-workspace-nav.ts` — `useProjectWorkspaceNav` (data
  source for switcher + omnibar).
- `apps/web/src/lib/agent-profile.ts:84` — `requireOwner` (the non-owner wall, §4.3).

**Agent presentation + omnibar input (the variant family — §3.3 / §3.6):**
- `packages/ui/src/components/agent-hud.tsx` — `AgentHudConversation` (the
  embeddable core to lift) + `AgentHud = { Root, Trigger, Panel }` (the dock
  shell). Variant shells wrap the core, not each other.
- `packages/ui/src/components/floating-dock.tsx` — `FloatingDock`, the dock's
  presentational primitive. `sidecar` / `inline` / `strip` are sibling shells,
  not dock variants.
- `@zigil/agent-react/attention` (`AttentionProvider` / `useAttention`) — the
  subject binding the `sidecar`/`inline` variants compose against. Review
  already builds an `AttentionContext` at `review-workspace.tsx:470`.
- `apps/web/src/components/agent/shell-omnibar.tsx` — gains the message mode
  (free-text → `session.send` → promote into the active presentation).
- Sigil Storybook — the variant showcase / registry demo (forge-storybook /
  ExhibitCard pattern); mock session + mock attention per exhibit.

**Agent output projection (§3.7) — see [`AGENT-OUTPUT-PROJECTION-SPEC.md`]:**
- `node_modules/.pnpm/@zigil+agent-surface@0.1.1/.../dist/contracts.d.ts` —
  `AgentToolCallPart` (`input?` / `output?: unknown`, host-rendered). The seam.
- `packages/ui/src/components/agent-hud.tsx` — `AgentPart` (the hardcoded switch
  to replace with a projection registry).
- sigil-design `packages/ui/src/components/marker.tsx` — `Marker` / `MarkerIcon` /
  `MarkerContent` (inline anchor atom).
- sigil-design `packages/ui/src/components/responsive-overlay.tsx` —
  `ResponsiveOverlay` (Popover/Drawer, trigger-anchored — the "expand" behavior).
- `@zigil/agent-react/attention` — `AttentionContext.selections` (the anchor
  targets annotations bind to; shared with input).

**The bugs:**
- `apps/web/src/features/review/review-workspace.tsx:703` — drop local HUD (§4.1).
- `apps/web/src/features/capabilities/capabilities-workspace.tsx:61` — Button/Link
  semantics (§4.2).

---

## 7. Acceptance criteria (each must be real and tested)

**Chrome / context**
1. A project/workspace switcher is visible in the shell on **every** non-login
   route, showing the active container; switching it changes what every scoped
   surface shows. (Rendered-state test + a route-by-route scoping check.)
2. Selecting a project/workspace persists across reload (per-principal
   preference; one store, not two).
3. The breadcrumb renders `Project › Workspace › Surface` (or omits the
   container portion for principal-level surfaces).

**Fluid switching**
4. Cmd+K offers project / workspace / session / surface groups and navigates
   correctly for each; sessions listed are scoped to the active workspace.
5. A pointer-first session switcher exists on the chat surface independent of
   the full drawer sheet.

**Consistency**
6. No region renders two agent presentations; `/review` shows one sidecar (not a
   dock + floating HUD), with the passage-aware placeholder preserved via
   attention projection.
7. No native-button-semantics warning on `/capabilities`; grep audit finds zero
   remaining `<Button render={<Link/>}>>` offenders.
8. A non-owner reaching `/agents/$personaId` sees a reduced projection (or the
   roster is owner-only) — never a raw "Owner access required" dead-end from a
   link the roster offered them.

**Scope honesty**
9. No UI in this spec performs cross-principal mutation or member management
   (deferred to the authz-gated follow-up).
10. README trust-model section + FEATURE-ROADMAP updated to reflect
    membership-scoped threads and shipped surfaces (the doc-staleness findings).

**Agent presentations**
11. A `sidecar` variant composes `AgentHudConversation` in-flow beside a
    subject, bound via `AttentionProvider`; a canvas/selection can anchor an
    `inline` variant. Both render against mock session + attention in the
    Storybook.
12. The omnibar message mode sends free text through the app-global session
    (no second session / transport) and promotes the response into the active
    region's presentation.
13. The variant shells live in sigil-design behind a registry (Q5 resolved);
    the app never reimplements the conversation core per surface.

**Agentic projections — see [`AGENT-OUTPUT-PROJECTION-SPEC.md`] criteria 1–5:**
14. Tool-call parts render through a projection registry; a tool-call named for
    an annotation renders as an anchored overlay, not a transcript line — and
    the default for unknown tools stays inline-text, so nothing breaks.
15. An agent annotation tool (`sigil-annotate` / `pin` / `highlight`) emits an
    output whose `anchorId` references a live attention item; the overlay floats
    over that item and expands on hover.
16. An `AmbientPanel` variant renders translucent by default and darkens on
    hover or when the session is streaming; `reasoning`/`text` parts can target
    it as their projection.

---

## 8. Non-goals (explicit — to resist scope creep)

- **No new knowledge/retrieval surface.** The review's blunt recommendation
  stands: another knowledge surface is premature until the center is visible.
- **No member-management / invitation UI.** Gated on registry-mutation authz (§5).
- **No route moves.** Paths stay; only *what "current" means* changes.
- **No change to the portable `NavModel` contract.** Container context enters
  via a shell slot, never inside `@workspace/ui`.
- **No move-thread / rebind UI in this pass.** The domain method exists and is
  tested (`rebindWorkspace`); the UI affordance is a separate, smaller decision
  (PROJ.2 divergence #4) — fold in only if it falls out naturally from the
  omnibar work.

---

## 9. Verification (implementation must hit these)

- `pnpm --filter web typecheck`, `--filter sigil-chat-agent typecheck`,
  `--filter sigil-chat-gonk typecheck` — clean.
- `pnpm --filter web exec vitest run` — existing suite green + new tests for
  criteria 1, 2, 4, 6, 8, 11, 12.
- `pnpm --filter web exec eslint` on every touched `apps/web` file — clean.
- Live browser: switcher visible + functional across Chat / Evidence / Review;
  Cmd+K switches containers; `/review` shows one HUD; non-owner login reaches a
  reduced agent profile (not an error).
- **Different-lineage review** before merge (house standard; PROJ.2 used it).
  Specifically verify the §4.1 one-presentation-per-region rule with a
  regression test that goes red if a second presentation mounts in a region
  that owns one, and that the variant showcase renders each shell against mock
  session + attention without the live runtime.

---

## 10. Open questions for David

- **Q1 (§4.3) — resolved (with added depth):** the Agent surface is **not**
  binary owner/everyone. Direction (David, this turn): agents can be
  **sponsored by specific principals**, and a member viewing an agent sees
  memories that are **shared OR specific to (that agent, that member)** — i.e.
  a *relationship* slice, not the owner's full memory and not nothing. The
  roster stays visible to members; the destination projects a per
  (agent, viewer) memory view. This supersedes the simple reduced-projection
  option and needs its own small spec for the sponsorship + relationship-memory
  model (follow-up, not blocking the chrome rework; the *non-owner no-longer-
  dead-ends* criterion still holds).
- **Q2 (§3.1) — resolved:** **sidebar header** slot, mirroring the `accountMenu`
  precedent (David, this turn). Breadcrumb stays read-only context.
- **Q3 (§1) — resolved (verified):** `dev` is a strict ancestor of `main`
  (`main` = `dev` + 6 cleanup commits: canvas-package removal, dead-code,
  registry pin, doc grounding). So they are effectively the same *product*
  today; `main` just also carries deletions. This branch stays off `dev` per
  team convention. **Action:** merge `main` into this branch *before*
  implementation touches the removed `@workspace/canvas` package or
  `packages/chat/src/lib/streaming.ts` (both deleted in main) — otherwise the
  variant/projection work risks resurrecting deleted code. No rebase needed;
  one forward-merge.
- **Q4 (§3.6) — resolved:** first demo cut is **dock (exists) + sidecar +
  inline + omnibar-input**; `strip` deferred (David, this turn). The `strip` /
  ambient variant stays captured in §3.6's table and in
  `AGENT-OUTPUT-PROJECTION-SPEC.md` as a documented future variant — not lost,
  just not in the first cut.
- **Q5 (§3.6) — resolved:** the variant registry + Storybook live in
  **sigil-design** (David, this turn). Carry-over caveat: confirm the shells are
  app-agnostic (pure presentation over the context-provided session/attention)
  before promotion, so the registry stays free of app wiring.
- **Q6 (§3.7) — resolved:** the projection model graduates to its own
  companion spec, [`AGENT-OUTPUT-PROJECTION-SPEC.md`](AGENT-OUTPUT-PROJECTION-SPEC.md),
  sibling to `AGENT-CONTEXT-AWARENESS-SPEC.md` (David, this turn). §3.7 is now a
  pointer; the design, acceptance criteria, and open questions live there.
- **Q7 (§3.7) — resolved:** annotations anchor to **attention items** — unify
  what the agent sees with what it annotates; one selection contract, shared
  with input (David, this turn). Coupling is deliberate.
- **Q8 (§3.7) — resolved:** agent annotation tools (`sigil-annotate` / `pin` /
  `highlight`) live in **Gonk** (`apps/gonk/src/registry/`), alongside the
  existing `sigil-project-*` / `sigil-workspace-*` tools (David, this turn).
