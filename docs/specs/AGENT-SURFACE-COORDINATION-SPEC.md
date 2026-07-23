# Agent Surface Coordination: Cross-View Presence, Navigation & Canvas

> Date: 2026-07-20
> Status: Draft product spec
> Scope: Sigil agentic workspaces, beginning with Sigil Chat
> Sibling to: [`AGENT-CONTEXT-AWARENESS-SPEC.md`](AGENT-CONTEXT-AWARENESS-SPEC.md)
> (input/attention) and [`AGENT-OUTPUT-PROJECTION-SPEC.md`](AGENT-OUTPUT-PROJECTION-SPEC.md)
> (output/projection). This spec is the *spatial* third: how the agent's
> presence and output span the **whole application surface**, not just the view
> the user happens to be on.

## 1. Goal

Today an agent annotation (per `AGENT-OUTPUT-PROJECTION-SPEC.md`) is rendered
against the *current* view's attention. But the agent often works across views —
it reads Evidence, flags something in Studio, leaves a note on a passage in
Review. Three capabilities are missing, and this spec defines them:

1. **Cross-view presence.** An annotation can belong to a view the user is *not*
   currently on, and the product must indicate that — "the agent annotated
   something on Evidence" while you're on Review.
2. **Agent-initiated navigation.** The agent can switch the user's view to one
   it has annotated, or open a small tour modal that walks the user through each
   highlighted place.
3. **The agent canvas (eventual).** A spatial canvas where the agent surfaces
   panels of the content it wants the user to see — composable, movable, host-
   rendered. Captured here as the destination; V1 is (1) and (2).

The agent becomes a navigator and curator of surfaces, not merely an annotator
of the current one.

## 2. What's already modeled — this extends, not invents

Verified in `@zigil/agent-react` (`attention.d.ts`) and the app:

- **`AttentionContext` already carries `route`** (and `workspace: { kind, id,
  label?, revision? }`). So "which view an anchor belongs to" is *already
  expressible* — an annotation record extends to carry the route/context it was
  created under, and the host compares it to the current route.
- **`AttentionSelection` is `{ kind, id, label?, detail? }`** — the stable
  anchor id projections already reference.
- **`AttentionTile`** (`packages/ui/.../attention-tile.tsx`) is the existing
  "what needs you" surface with a *binding projection contract*: a count renders
  only when state is `live` and non-null ("no aspirational numbers, ever"),
  states are `live | empty | loading`, and it carries **no domain vocabulary**.
  Cross-view indication inherits this discipline.
- **sigil-design `packages/canvas`** (`registry-palette.tsx`,
  `transform-handles.tsx`, `alignment-tools.tsx`, `lib/grid.ts`) is a real
  spatial-canvas substrate — the foundation the agent canvas (§6) builds on.

## 3. View identity — a view is a route + its attention context

A **view** is a route (`/evidence`, `/review`, `/studio`, …) together with the
attention context active on it. There is no separate abstract `viewId` to
invent: the route *is* the view identity, and the attention context carries it.

**The annotation record gains a `view` field** (extends
`AGENT-OUTPUT-PROJECTION-SPEC.md` §3.2):

```
{ anchorId, view, body, kind, mode? }
  view      → { route, workspaceId? }   // the context the annotation was
                                        //   created under. Route is the canonical
                                        //   DISPLAY KEY (not authority — see §4);
                                        //   workspaceId disambiguates if the same
                                        //   route can render different workspaces.
  anchorId  → AttentionSelection.id within that view (display hint, §4)
  ...
```

The annotation is *pinned to a view*, not to the user's current location. When
the user navigates to that view (and the selection still resolves), the
projection renders in place; otherwise it surfaces through cross-view
indication (§5).

## 4. Authorization — scope authorizes; view is a target, not authority

This inherits Vesper's boundary from `AGENT-OUTPUT-PROJECTION-SPEC.md` §4.1
verbatim, extended to the spatial case:

> **Scope membership authorizes the tool call.** `view` and `anchorId` are
> *display targets* the host resolves, not authorization evidence. The route
> and selection id originated in the browser; the server does not trust them as
> capability.

- An annotation tool may act because the principal is a member of the
  project/workspace — not because a route or anchor validated.
- **Agent-initiated navigation** (§6) is a UX mutation on the user's session
  (changing their visible route) and is a **separate moment of consent from
  tool-execution approval.** The existing tool-approval preference may
  auto-allow a tool, so it *cannot* guarantee navigation is consented. Therefore
  `sigil-navigate` emits a **navigation proposal**; the host presents
  **Follow / Decline** — *unless* the user already initiated the navigation
  themselves (clicked a cross-view indicator, §5, or advanced a tour step, §6),
  in which case that user action is the consent. Tool approval and route-change
  are two different gates; neither subsumes the other.
- The canvas (§7) is host-rendered projection; placing a panel grants no
  authority over the content it shows.

## 5. Cross-view indication

When an annotation's `view.route !== currentRoute`, it does not render in place
(there's nothing to anchor to on this view). It surfaces as **indication**:

- **A cross-view indicator on the agent HUD / attention rail**, following the
  `AttentionTile` projection contract: a `live` count of cross-view annotations
  grouped by route ("3 on Evidence · 1 on Studio"), `empty` when none, `loading`
  while resolving. No aspirational counts.
- **A route badge in the sidebar nav** next to each route that holds *unseen*
  cross-view annotations — so the chrome itself says "Evidence has something
  from the agent" without the user opening anything.

**Count source + read lifecycle (Vesper #2).** For the count to clear honestly
(it must, or it becomes the aspirational number the `AttentionTile` contract
forbids), the lifecycle is fixed:

- **Count source (V1):** annotations produced by the **active thread** on views
  other than the current one. One thread, one count — no global aggregation that
  could drift or double-count.
- **Seen receipt (separate store, not a mutation).** Annotation output is
  **shared and immutable** — it cannot carry per-viewer state. So *seen* is a
  separate receipt, never a field on the annotation:
  - **Annotation identity** = `threadId + toolCallId` (the `toolCallId` is the
    `AgentToolCallPart.id` that already exists in the contract — no new id
    needed; an explicit `annotationId` is an equivalent alternative).
  - **Seen receipt** = `{ principalId, threadId, toolCallId, seenAt }`, stored
    in its **own per-principal receipt store**, keyed by annotation identity.
    The shared annotation is never mutated per viewer.
  - An annotation is *seen* when the user visits its `view.route` **and** the
    anchor is presented to them (rendered in place, or surfaced in the
    active-thread indicator list). Visiting the route alone does not mark
    distant anchors seen; the anchor must actually reach the user.
- **Clearing:** the route badge clears when **every** active-thread annotation
  on that route is seen. The count is the number of *unseen* annotations, not
  all annotations — so it can reach zero honestly.

Indication is read-only projection; it never auto-navigates. The user always
chooses to follow.

## 6. Agent navigation & tour tools (application-owned; Eve-hosted through Gonk)

Two proposed sibling tools to the annotation tools in
`packages/agent-tools/src/`:

- **`sigil-navigate`** — proposes switching the user's view to a target route
  (+ optional workspace). Output: `{ route, workspaceId?, selectionId? }`. Per
  §4, the host presents **Follow / Decline** unless the navigation was
  user-initiated; on Follow it navigates and, if `selectionId` resolves,
  scrolls/highlights it. A Declined proposal surfaces back through the turn.
- **`sigil-guide`** (tour) — opens a small modal that walks the user through an
  ordered set of highlighted places. Output: `{ steps: [{ route, workspaceId?,
  selectionId, note }] }`. The host renders a tour modal: one step at a time,
  "Next / Done," navigating per step and resolving each annotation. Composes
  cross-view annotations into a guided sequence rather than leaving the user to
  find them.

Both are *projections the host honors*, not commands the agent forces. The host
may decline (e.g. if the user is mid-edit) and surface that back through the
turn.

**V1 sequencing (Kimi).** Cross-view indication (§5) lands **before**
agent-initiated navigation (this section). Indication is cheap — the annotation
records already carry `view`, and an indicator is read-only projection.
Navigation is the first capability in this whole family that takes control of
the user's hands (it changes their visible route), so it earns its own beat
rather than riding along on the indication work. Ship indication, observe, then
add navigation.

## 7. The agent canvas (eventual — captured, not V1)

The destination: a spatial canvas where the agent composes **panels** of content
it wants the user to see — an annotation excerpted next to a related artifact, a
live view embedded as a tile, a note pinned beside a chart. Built on sigil-design
`packages/canvas` (registry palette, transform handles, alignment, grid):

- A **panel** is a projection target — it can host an annotation, an embedded
  view, or a content card. The agent places/arranges panels; the host renders
  them (host-owned, like all projection).
- The canvas is **one more presentation variant** in the chrome-rework sense
  (`PRODUCT-CHROME-REWORK-SPEC.md` §3.6): a region whose projector is
  "canvas panels" rather than `inline`/`overlay`/`ambient`.
- **Not V1, and carries no V1 acceptance criterion** (Vesper #3): a canvas
  Storybook spike is real work, and this spec won't half-commit to it. Captured
  so the cross-view + navigation design (§3–§6) doesn't preclude it: the
  annotation/tour records already carry the `{view, anchorId}` structure a
  canvas panel would surface as a tile. When the canvas is pursued, it gets its
  own slice with its own criteria.

## 8. Non-goals

- **No new view-id abstraction.** A view is a route + attention context; the
  route is the identity. Don't fork a parallel `viewId` registry.
- **No silent navigation.** Agent navigation is a **proposal** the host
  presents (Follow / Decline) unless user-initiated; indication never
  auto-navigates. Tool-execution approval does **not** subsume route-change
  consent — they are separate gates (§4).
- **No agent authority over canvas content.** Panels are host-rendered
  projections; the agent places, it does not execute privileged actions through
  a panel (that's a separate authorization question, deferred).
- **No cross-workspace annotation in V1.** `view.workspaceId` is captured for
  disambiguation, but V1 annotations are within the active workspace; cross-
  workspace surfacing is a later increment.

## 9. Acceptance criteria (each must be real and tested)

1. An annotation record carries `view: { route, workspaceId? }`; an annotation
   whose `view.route` matches the current route renders in place; one that
   doesn't renders through cross-view indication, never in place.
2. Cross-view indication follows the `AttentionTile` projection contract: a
   `live` count grouped by route, `empty` when none, `loading` while resolving —
   no count rendered in non-live states.
3. A route badge appears in the sidebar nav beside any route holding **unseen**
   active-thread cross-view annotations, and clears only when every such
   annotation on that route is *seen* (§5 read lifecycle) — never on route
   visit alone.
4. `sigil-navigate` emits a **navigation proposal**; the host presents
   Follow / Decline unless user-initiated (indicator click / tour advance); a
   Declined proposal surfaces back through the turn. Tool-execution approval is
   a separate gate and does not auto-consent the navigation.
5. `sigil-guide` renders a tour modal stepping through an ordered set of
   `{route, selectionId, note}`, navigating per step and resolving each
   annotation; "Next / Done" controls are present.
6. Selecting a cross-view indicator is a user-initiated navigation (consent
   given by the click); the host navigates and presents the annotation in place,
   marking it seen.

   *(The agent canvas, §7, has no V1 acceptance criterion — it is future work
   with its own slice.)*

## 10. Anchors (file:line — the implementation map)

**View identity (the decisive grounding):**
- `node_modules/.pnpm/@zigil+agent-react@0.1.1.../dist/attention.d.ts` —
  `AttentionContext.route` + `workspace` (view identity already modeled);
  `AttentionSelection { kind, id, label?, detail? }` (the anchor).

**Indication (inherit the projection contract):**
- `packages/ui/src/components/attention-tile.tsx` — `AttentionTile`
  (`live | empty | loading`, count-only-when-live, no domain vocabulary) — the
  model for cross-view indicators and route badges.

**Navigation tools (sibling registry site):**
- `packages/agent-tools/src/annotations.ts` — the current sibling registry site
  for `sigil-annotate`; `sigil-navigate` / `sigil-guide` should join the
  application registry in their own focused module.

**The canvas (eventual):**
- sigil-design `packages/canvas/src/components/` — `registry-palette.tsx`,
  `transform-handles.tsx`, `alignment-tools.tsx`; `lib/grid.ts` — the spatial
  substrate the agent canvas builds on.

**Authorization (inherited) + navigation consent:**
- `apps/web/src/lib/agent-tool-approval.ts` — the tool-execution approval gate
  (a *separate* gate from route-change consent; §4).
- `apps/web/src/lib/agent-scope-authorization.server.ts` — `assertAuthorizedScope`
  (scope membership, not view/anchor, authorizes the tool call).

## 11. Relationship to the sibling specs

- **Input** (`AGENT-CONTEXT-AWARENESS-SPEC.md`): defines attention/selections.
  This spec depends on `AttentionContext.route` already being there.
- **Output** (`AGENT-OUTPUT-PROJECTION-SPEC.md`): defines projection. This spec
  *extends* the annotation record (§3.2 of that spec) with a `view` field, and
  inherits its §4.1 authorization boundary (§4 here).
- **Chrome** (`PRODUCT-CHROME-REWORK-SPEC.md`): the agent canvas (§7) is one
  more presentation variant; cross-view route badges live in the sidebar nav the
  chrome rework defines.

The three form a triangle: **attention is what the agent sees; projection is
what it says back onto what it sees; surface coordination is how that spans and
moves across the whole application.**

## 12. Open questions

- **Tour modal vs. inline stepping.** Does `sigil-guide` render a dedicated modal,
  or step inline (navigate + highlight, with a floating "step 2/5" control)?
  Lean modal for discoverability; confirm.
- **Cross-view annotation lifetime.** Are cross-view annotations persistent
  (survive reload, tied to the thread) or transient (clear on turn end)? The
  §5 read lifecycle assumes persistent + per-thread; confirm. (Lean persistent,
  scoped to the thread — they are agent output, like any tool result.)
- **Canvas panel content authority.** When the canvas (§7) embeds a *live view*
  as a panel, does interaction within that panel carry the view's full
  authorization, or is it read-only? Lean read-only in the canvas's first slice;
  interactive embedding is a later authorization question.
- **Signed anchor authority — resolved (defer).** Nothing in this triangle
  grants capability through an anchor, so signed/cryptographic anchors are
  deferred indefinitely (Vesper). **Principle for when it returns:** if a later
  click performs a privileged domain action *off* an annotation, authorize
  **that action against its real resource identity at execution time** — do not
  make every harmless display anchor cryptographic in anticipation. Display
  anchors stay hints; privileged actions get authorized at their own seam.
