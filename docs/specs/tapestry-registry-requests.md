# Registry Requests from Tapestry — batch 1

**Date:** 2026-07-12 · **Requester:** Tapestry (`~/Dev/apps/tapestry`, specs in `docs/specs/`)  
**Context:** the ecosystem Sigil-first rule — generalizable presentation primitives build here, then install into apps as owned source. These briefs are **S1-grade** (fully specified, no taste decisions required) and double as the codex UI-eval S1 briefs (`~/Dev/platform/ecosystem/specs/codex-ui-eval-program.md`).  
**Conventions:** Sigil registry house rules — theme tokens only (no raw colors/arbitrary values), shadcn-registry item shape with complete dependency closure (external-checkout installable — the §8.4 rule), accessible by construction. Reference implementations cited below are *ports*: keep the interaction design, re-home onto Sigil primitives/tokens.

---

## R1 · `provenance-chip`

Inline chip showing where a fact/record came from; the ecosystem renders provenance everywhere.

- **Anatomy:** monospace source string, middle-truncated to fit (`verra/characters/…/iva.md`); optional leading glyph slot; hover/focus opens a popover with the full source, optional detail line, optional "open" link.
- **API:** `source: string` · `detail?: string` · `href?: string` · `size?: "sm" | "md"` (sm = table cells, md = detail panels).
- **States:** default (quiet, `text-muted-foreground`), hover/focus (popover), with-link (external-link affordance inside popover only — the chip itself stays quiet).
- **A11y:** chip is a button; popover keyboard-reachable and ESC-dismissable; full source available to screen readers via accessible name (not just the truncation).
- **Acceptance:** truncation is middle-out (start and file both visible); popover never clips at viewport edges; installs into an external checkout and typechecks.

## R2 · `compare-panel`

The one adjudication grammar: source vs N candidates, accept one. Generic slots — not media-specific.

- **Reference ports:** tapestry-lit `AudioRegenerationCompare`, `MusicCueCard`, chunk-compare in `PieceCastingSection` (`~/Dev/ai/writing/tapestry/apps/web/src/components/…`) — same pattern, three implementations; this unifies them.
- **Anatomy:** optional "current" panel + candidate panels labeled A, B, C… (`String.fromCharCode(65+i)`); each panel renders a `children` slot (audio player, image, text diff — caller's concern); per-candidate primary **Accept** + quiet **Reject**; optional per-candidate note slot.
- **API:** `current?: ReactNode` · `candidates: { id: string; content: ReactNode; note?: ReactNode }[]` · `onAccept(id)` · `onReject?(id)` · `pendingId?: string` (accept in flight → all actions disabled) · `acceptedId?: string` (renders resolved state).
- **States:** open (choosing), pending (mutation in flight), resolved (accepted candidate marked, others muted); empty-candidates state designed ("no candidates yet" line, not a blank).
- **A11y:** candidates are a labeled group; accept buttons carry candidate labels in accessible names ("Accept candidate B").
- **Acceptance:** works with arbitrary slot content; resolved state readable without color alone (badge + position, not just tint).

## R3 · `document-minimap`

Right-rail document overview with jump-to markers.

- **Reference port:** already extracted once — `packages/ui/src/components/review-minimap.tsx` in the tapestry-lit repo. Port it faithfully; genericize the marker model.
- **API:** `markers: { id: string; position: number /* 0..1 */; kind: string; label?: string }[]` · `kindStyles: Record<string, { className: string; glyph?: string }>` (injected — no domain kinds baked in) · `viewport?: { start: number; end: number }` · `onJump(id)`.
- **A11y:** markers focusable in document order; label announced; the map is supplementary navigation (never the only path to a marker's target).
- **Acceptance:** 500 markers render without jank; kinds are entirely caller-defined.

## R4 · `spotlight-scrim`

Dim everything except one element — the mobile-annotation focus pattern.

- **Reference port:** `AnnotationSpotlight` (`book-reader.tsx:414` in tapestry-lit): SVG mask + clip-path cutout, rAF-tracked target rect.
- **API:** `targetRef: RefObject<HTMLElement>` (or `getRect(): DOMRect`) · `onDismiss()` · `padding?: number` · `radius?: number`.
- **States:** entering/leaving (opacity transition token), tracking (target moves/scrolls — rAF).
- **A11y:** focus moves into the spotlit region and is contained; ESC and scrim-tap dismiss; `aria-modal` semantics on the overlay.
- **Acceptance:** target scroll/resize tracked without layout thrash; dismissal restores prior focus.

## R5 · `popover-edit` primitives

Click-any-value-to-edit: the value *is* the trigger; the popover holds one control.

- **Reference:** Worldbuilder's character-detail popovers (drive/arousal/cycle editors — `$world/character/$characterId.tsx` in `~/Dev/ai/worldbuilder/packages/web`): quiet value → popover with label + Slider/Select → implicit commit.
- **Deliver as three items sharing one shell:** `popover-edit` (shell: trigger renders current value as a quiet button; popover = label + control slot + optional hint; commits on change or close) · `popover-edit-slider` · `popover-edit-select`.
- **API (shell):** `value: ReactNode` · `label: string` · `children` (the control) · `onOpenChange?` · `disabled?`.
- **A11y:** trigger announces "edit {label}, current value {value}"; keyboard-complete (open, adjust, ESC cancels without commit, close commits); no keyboard trap.
- **Acceptance:** ESC-cancel genuinely discards (proven by test); trigger tab-order identical to plain text position.

## R6 · generic halves (the domain-split rule)

Per SPEC §5: domain semantics stay app-owned. Ship the *generic* halves only:

- **`ramp-badge`** — `value: number` + `ramp: { max: number; className: string; glyph?: string }[]` → badge styled by ramp step, **with a non-color redundant cue** (glyph or underline pattern per step — required, not optional). No knowledge-tier names anywhere in Sigil.
- **`status-badge`** — `status: string` + injected `variants: Record<string, {...}>`. No authority-state names in Sigil.
- **`pill-bar`** — single-select pill row: `items: { id; label; glyph?; badge? }[]` · `selectedId` · `onSelect` · overflow → horizontal scroll with fade affordances. No POV/persona semantics in Sigil.

**Acceptance (all three):** zero domain vocabulary in the registry item; an app can express Tapestry's tier ramp / authority states / perspective bar purely via props.

---

## RFC (scoping requested, not yet a brief) · DEVKIT modules

Two module-scale items — requesting a feasibility/shape pass from the Sigil side before we spec fully:

1. **`spec-viewer`** — render a repo's markdown specs in-app (nav tree + doc view; our ROADMAP/SPEC as first content).
2. **`context-flag`** — a dev-mode overlay: pick any element/route → capture `{ route, component displayName, dom path, viewport }` → hand to an app-provided handler (Tapestry persists these as Deadletters records). The registry item owns capture + affordance; persistence is the app's.

## Coming later — do NOT start (design work pending on our side)

Era band and time scrubber (partial-order rendering of blurry/overlapping intervals — the hard part, being designed), validity chip (indeterminate-state treatment), attention tile (projection contract). These arrive as batch 2 with the same S1 rigor.
