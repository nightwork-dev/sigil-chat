# Registry Requests from Tapestry — batch 2 (temporal set)

> Date: 2026-07-12 · Author: Fable (Tapestry side)
> Status: implemented and integration-verified on `codex/temporal-registry-integration`.
> Supersedes the "do NOT start" hold in batch 1 — the design work
> that hold was waiting on (the CAL story-time model, `tapestry/docs/specs/CALENDAR.md`)
> is done, and these briefs encode its rendering decisions.
>
> **Domain split (binding, per R6):** Sigil never imports CAL or any Tapestry
> package. All four components take *display-shaped props*; the app computes
> states/positions via CAL and hands results in. No era names, no calendar
> notation parsing, no domain vocabulary in Sigil.

## The partial-order rendering rulings (read first — they govern all four)

CAL's comparator returns five results (before/after/equal/overlaps/indeterminate)
and its values carry authored blur. The UI consequences, ruled on the Tapestry side:

1. **Indeterminate is a first-class visual state** — a distinct hatch/tilde
   treatment, never an error color, never coerced into a position. Anything that
   cannot honestly be placed renders *as unplaceable*, visibly.
2. **Sequence is the backbone; proportion is a privilege.** Ordered-but-unmeasured
   spans render as sequence (equal-width segments) with a soft-edge treatment;
   measured spans may render proportionally. The two modes must be visually
   distinguishable so fake precision never displays.
3. **Blur is soft, not broken.** Soft boundaries render as feathered/gradient
   edges — an invitation (the definition gradient), not a degraded state.
4. Every color-coded signal carries a redundant non-color cue (glyph, pattern,
   or weight).

## B1 · `validity-chip`

The chip that says how a record relates to the current story moment.

- **API:** `state: "active" | "not-yet" | "ended" | "indeterminate"` ·
  `label: string` (the caller-formatted interval, e.g. from CAL's `format`) ·
  `size?: "sm" | "md"` · optional `detail?: string` (popover, viewport-safe).
- **Treatments:** `active` quiet (default ink, no chrome beyond the chip);
  `not-yet` / `ended` dimmed with a directional glyph (▹ before / ◃ after — or
  equivalent lucide glyphs); `indeterminate` gets the tilde/hatch treatment
  (ruling 1) — pattern fill or `~` prefix + dashed border, muted, NOT warning/error.
- **A11y:** state announced in the accessible name ("valid interval indeterminate"),
  not carried by color alone.
- **Acceptance:** all four states legible in grayscale; zero domain vocabulary.

## B2 · `era-band`

The horizontal band of ordered eras — 3,500 years made emotionally legible (V7).

- **API:** `eras: { id: string; label: string; subtitle?: string; tone?: string
  /* caller-supplied className token, e.g. a theme token class */; span?: { start:
  number; end: number } | null /* normalized 0..1 on the caller's axis; null =
  order-only */; softStart?: boolean; softEnd?: boolean }[]` ·
  `cursor?: number | null` (0..1) · `onSelectEra?(id)` · `height?: "sm" | "md"`.
- **Layout (ruling 2):** eras with `span` render proportionally; eras with
  `span: null` render as equal-width sequence segments carrying the indeterminate
  edge treatment. Mixed bands are expected and must read honestly — proportional
  segments get solid edges, order-only segments get the hatch/soft edge.
- **Boundaries (ruling 3):** `softStart`/`softEnd` render feathered edges
  (gradient), hard edges render as clean seams.
- **Tones:** `tone` is an injected className; the band never invents colors. With
  no tone, segments alternate two neutral surface steps.
- **Cursor:** a thin marker line + label slot; hidden when null.
- **A11y:** each era is a focusable region with label+subtitle announced; cursor
  position announced as a percentage or the caller-provided label.
- **Acceptance:** renders 3 eras and 12 eras without layout collapse at 375px
  (horizontal scroll with edge fades, reusing the pill-bar mask approach);
  mixed proportional/sequence bands visibly distinct in grayscale.

## B3 · `time-scrubber`

The story-time cursor control. Snaps to attested moments — never fabricates a
position between them (Worldbuilder's history slider lesson: snap-to-real-snapshot).

- **API:** `stops: { id: string; position: number /* 0..1 */; label: string }[]` ·
  `value: string | null /* stop id */` · `onChange(id)` (during drag/arrow) ·
  `onCommit(id)` · `zones?: { start: number; end: number }[]` (indeterminate spans
  rendered hatched on the track) · `presentLabel?: string` + `onReturnToPresent?()`
  (renders the "return" affordance only when provided).
- **Interaction:** pointer drag snaps to nearest stop; arrows move stop-by-stop;
  Home/End go to first/last; tick marks per stop; current stop's label shown.
  The track may be non-linear — positions are caller-computed; the scrubber never
  interpolates meaning between stops (ruling 1: between-stops is not a value).
- **A11y:** slider semantics with `aria-valuetext` = current stop label; hatched
  zones described in the accessible description.
- **Acceptance:** 50 stops usable by keyboard alone; no fabricated intermediate
  values reachable by any input method.

## B4 · `attention-tile`

The home-surface tile: "what needs you." Projection contract is binding (V9):
**no aspirational numbers** — the tile renders live data or an honest empty state.

- **API:** `title: string` · `state: "live" | "empty" | "loading"` ·
  `count?: number | null` (rendered ONLY when state is live and count non-null) ·
  `items?: { id: string; label: string; meta?: string }[]` (up to ~3 preview rows) ·
  `glyph?: ReactNode` · `onOpen()` (whole tile is the affordance).
- **Treatments:** live = quiet card, count in tabular mono, preview rows muted;
  empty = same card with a single quiet line (caller-provided `emptyLabel?: string`,
  default "Nothing waiting"); loading = skeleton rows, visually distinct from empty
  (a skeleton must never be mistaken for "none").
- **A11y:** tile is a single button/link with a composed accessible name
  ("{title}, {count} items" / "{title}, nothing waiting").
- **Acceptance:** the three states are unmistakable; no count ever renders in
  empty/loading; zero domain vocabulary.

## Sequencing

Commission as one tranche after `glm/registry-tranche-2` merges. Suggested order:
B1 → B4 (small, independent) → B2 → B3 (share the track/edge-fade vocabulary; B3
may reuse B2's hatch treatment as a shared local pattern — extract only if a third
caller appears, per the P2 discipline).
