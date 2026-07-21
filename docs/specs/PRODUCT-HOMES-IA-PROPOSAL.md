# Product homes — IA and interaction proposal (SC.7)

> Author: Neve Laine · Date: 2026-07-21 · Status: Design proposal for review
> Answers: Vesper's SC.7 brief against
> [`SCOPE-COMPOSITION-AND-SCOPED-WORK-SPEC.md`](SCOPE-COMPOSITION-AND-SCOPED-WORK-SPEC.md)
> (in `sigil-chat-scope-composition`). Design first — no implementation here.
> Companion to, and partly revising, `PRODUCT-CHROME-REWORK-SPEC.md`.

## 0. The one-paragraph shape

Three stable orientation layers — **Project Home**, **Workspace Home**,
**Session** — with the breadcrumb promoted from container chain to
**via-path**. Feature surfaces stop being the product's cabinet and become
actions available *on* a home. The entered-via perspective is preserved in
navigation and in the URL, labelled against canonical ownership, and never
dressed as authority.

## 1. Responsibilities, kept distinct

| Layer | Question it answers | It is NOT |
| --- | --- | --- |
| Project Home | What exists and is happening in this namespace? | A settings page, a permission boundary UI |
| Workspace Home | What is this initiative, what's in it, what's moving? | A second project |
| Session | What am I executing right now, and what did it produce/commit? | An owner of the resources it can see |

Each home composes the same nouns — workspaces, sessions, agents,
artifacts/resources, work, activity, attention — narrowed to its layer.
Nothing here is a new subsystem; the homes are *compositions of records the
scope spec already makes durable*.

### 1.1 Project Home

- **Workspaces**: owned first, mounted second with a quiet mount chip
  (`Shared from Brand`). Mounted rows open the workspace *via this project*
  (§3) — they do not adopt it.
- **Sessions**: recent/active across the project, grouped by workspace.
- **Agents here**: personas discoverable in this scope (home or
  `discoverable-from` link), opening the per-scope profile projection.
- **Work**: the project's default roadmap board (one root, eligible rollups).
- **Activity + attention**: recent durable events; current agent attention
  indicators where the surface-coordination contract allows.

### 1.2 Workspace Home

- Header: name, icon, purpose, status. When entered via a non-owner path, a
  quiet `Shared from <Owner>` chip linking to the canonical home as an
  explicit jump — never a forced redirect.
- **Sessions** with status; **participants** (members + agents); **resources**
  homed or mounted, identity-deduped (§8.1 of the scope spec).
- **Board**: work homed in or explicitly bound to the workspace.
- **Recent attention** scoped to the workspace.

### 1.3 Session

- The execution surface (existing chat), plus: **produced artifacts** rail and
  **linked commitments** (work explicitly bound to this session — not the
  agent's ephemeral checklist, per scope spec §9.2).
- The session header keeps the one-rail pattern: status + switcher + context
  inspector in the top rail, never a second header row.

## 2. Navigation rules

1. **The breadcrumb is the via-path.** Each crumb is a switcher *at its
   level* (projects in the org, workspaces in the via project). Selecting a
   crumb navigates to that home; the chain otherwise preserves the path you
   arrived by.
2. **Perspective travels in the URL** as `?via=<scopeId>` on workspace and
   session URLs: shareable, server-validated per scope spec §7 (containment
   or permitted `mounted-in`, *and* visible to this principal — tightening
   #1), stripped with a diagnostic when stale.
3. **Surface nav answers "what can I do here?"** Within a perspective the
   left nav offers the home views + the actions legal in it (Converse, Board,
   Resources, Sessions), not the global feature list.
4. **The omnibar** searches projects, workspaces, sessions, resources, and
   saved views with scope labels and permission-filtered results.
5. **Cross-view agent indicators** may point elsewhere; following stays a
   user action (surface-coordination contract). Annotations render in every
   eligible view as one record, labelled with their creation perspective.

## 3. What survives the chrome build / what gets revised

**Stays intact:** breadcrumb-as-switcher (extends to via-path); the
`staticData.rail` route-declaration pattern (homes declare their rail content
the same way); one-presentation-per-region registry; part-projection +
annotation overlays + ambient panel; the management session (becomes the
per-scope "agents here" on homes; global management remains
installation-level); the labs island (demo workspaces generalize into
resources on homes).

**Revised:** `ActiveContainerProvider`'s scalar `{projectId, workspaceId}`
becomes `ScopePerspective { focusScopeId, viaScopeIds[] }` in the same slot —
the chrome spec's §3.1 persistence carries over verbatim, the record gets
richer. The chrome spec's "switcher in the sidebar" is superseded by the
breadcrumb switcher (already landed). §3.2's flat feature nav is superseded
by this proposal's home-oriented nav.

## 4. State matrix

- **Empty**: project with no workspaces → create/request affordance, not a
  blank page; workspace with no sessions → start-one; board with no items →
  the intake affordance (request tool is one path); no mounts → the section
  simply doesn't render.
- **Loading**: per-section skeletons on homes (never a whole-page spinner);
  boards load the saved view first, records second.
- **Denied**: a visible-but-inaccessible mount renders **inert** — lock icon,
  "Request access" affordance, never a clickable dead-end. Direct URL to a
  denied scope: 403 only when the scope's existence is already discoverable
  to this principal, else 404 (existence is itself information).
- **Archived**: read-only views with a banner; archived home never deletes
  mounts (spec §4.1.5) — mounted records show "home archived"; un-archiving
  is an authorized action from the home.
- **Mobile**: homes collapse to single-column stacks; the breadcrumb
  truncates to focus + one level up with the rest in overflow; boards become
  list view; the bottom rail keeps status + chords, drops secondary text.
- **Keyboard**: omnibar-first; home sections are roving-tabindex lists;
  switcher menus fully operable; the chord row re-declares per home via
  `staticData.rail.chords`.
- **Cross-view attention**: an annotation made on Project A's view of a
  shared workspace appears on Project B's view as the same record, labelled
  "noted from Commerce Platform" — projection, never authority.

## 5. Sequencing notes

Design review first (this document + the principal access matrix from spec
§6). The via-perspective migration (spec slice 3) is the hinge for all
chrome work — homes can begin as static compositions (sessions list, board
embed, resource lists) before activity/attention feeds are real. Do not
build home views that invent multi-parent records ahead of slices 2–3.
