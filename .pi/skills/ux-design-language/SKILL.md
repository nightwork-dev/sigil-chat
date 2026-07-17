---
name: ux-design-language
description: Use when designing or reviewing any screen — dashboards, tooling, showcase pages, forms — in this template or a project scaffolded from it. Triggers on "design this screen", "review the UI", "does this look right", "add a badge/label/indicator", or before adding any visual element (color, shadow, badge, icon, gradient) to a page. MANDATORY check before adding any badge, shadow, gradient, or eyebrow text.
---

# UX design language — hard rules

Every visual element on screen must justify its existence. Before adding
ANY color, shadow, badge, icon, gradient, or line of chrome text, run the
check in RULE 1. This is not a style preference — violating it is a defect,
treat it the same as a type error.

Known failure mode this skill exists to stop: adding unnecessary badges,
eyebrow labels, decorative icons, and status pills that don't correspond to
real changing state. If you notice yourself reaching for a `<Badge>`, a
small uppercase label above a heading, or a status dot — STOP and run
RULE 1 before writing it.

## RULE 1: The one-sentence test — run before adding ANY visual element

Ask: **"What does this communicate, and does it communicate exactly one
thing?"** State the answer in one sentence before writing the code.

- If you cannot state a one-sentence answer, DO NOT ADD THE ELEMENT.
- If the answer is "it looks more finished" or "it fills the space" — that
  is not a valid answer. DO NOT ADD THE ELEMENT.
- If the element is a badge/pill/status-indicator: the test additionally
  requires the displayed value to be able to CHANGE based on real state. A
  badge that always renders the same static text FAILS this test — delete
  it, replace it with plain text, or wire it to real state.

## RULE 2: Forbidden by default — do not add these unless the user explicitly asked

- Eyebrow text (a small uppercase label above a title) when the title
  already states the same thing.
- A description paragraph directly under a title that just restates the
  title in longer words.
- A badge/pill with static, never-changing text.
- A shadow on a card/surface that is not elevated, not interactive, and not
  being dragged. Default cards in a flat list get NO shadow.
- A gradient background unless the specific theme/brand explicitly uses
  gradients as its identity (check `apps/web/src/styles/themes.css` first —
  none of this template's default themes do).
- A generic icon next to a heading purely for visual balance. An icon must
  either be functional (nav wayfinding — see `extending-this-template` Rule
  3.3) or it must be cut.
- Uniform equal-sized grid cards when the underlying data has unequal
  importance. Do not default to a 3-column or 4-column grid without
  checking whether the content actually has equal weight.

If you added any of the above, remove it before calling the task done. This
is a required self-check, not optional cleanup.

## RULE 3: Color — one meaning per token, no exceptions

- `text-destructive` / `bg-destructive` = error/danger. Never anything else.
- `text-primary` / `bg-primary` = active/selected/on-state. Never anything
  else.
- Chart tokens (`chart-1`, `chart-2`, `chart-3`...) = fixed data-series
  identity. A given series keeps the same chart token everywhere it
  appears; do not reassign chart colors per-screen.
- Raw Tailwind colors (`bg-amber-400`, `text-yellow-500`) are permitted
  ONLY when there is no existing semantic token for the concept (e.g. a
  severity taxonomy). When you do use one, put it in ONE shared variant map
  (see `packages/ui/src/lib/value-status.ts` as the pattern) — do not
  inline the same raw color string in more than one component.
- Do NOT reach for default AI-palette blue (`#3B82F6` / `bg-blue-500`
  family) without a stated reason. This template ships seven named themes
  (`apps/web/src/styles/themes.css`) specifically so you never need an
  arbitrary blue — use a theme token instead.

## RULE 4: Typography — minimum sizes, no arbitrary mixing

- Primary reading body text: minimum 14px. Do not ship an 11–12px body
  paragraph as primary content "because it looks clean."
- Smaller sizes (9–11px) are permitted ONLY for secondary/dense/technical
  readouts (timestamps, numeric telemetry, the instrument-panel style
  already used in this template's `instrument/`, `display/`, `sequencer/`
  components) — never for primary content a user is meant to read normally.
- `font-mono` = infrastructure/data/code/numeric readout. Proportional font
  = content meant to be read as prose. Do not mix these registers on the
  same element without a reason.

## RULE 5: Motion must encode a real state change

- Every `transition`/`animate-*` you add must correspond to an actual state
  transition (value changed, panel opened, item entering/leaving,
  uncommitted-decision pulse). If the animation would look identical
  whether or not any real state changed, delete it.
- Do not add a shimmer, pulse, or fade "for polish" on a static element.

## RULE 6: Layout weight must match information priority

- Before defaulting to a uniform grid (all cards same size), check: is the
  underlying content actually equal-priority? If one item is more
  important, its layout weight (size, position, border weight) must show
  that — asymmetry is correct here, not a flaw.
- A number shown with no comparison (no delta, no threshold color, no
  trend line) is likely incomplete — check whether it needs context before
  shipping it bare.

## RULE 7: Empty states are not exempt from RULE 1

An empty state is the first thing a new user sees, not "nothing to render."
Do not pad it with an illustration/badge/eyebrow "to make it feel
finished" — that fails RULE 1 exactly like everywhere else. If you add
teaching copy or a call-to-action to an empty state, it must pass the same
one-sentence test: what does this specific addition communicate that plain
text didn't already say?

## RULE 8: One card level, one tint level — no nested surfaces

- A card is ONE elevation level. Do NOT put a bordered or tinted sub-card
  inside a card. A card of cards is a defect — if every group is a card,
  "card" no longer means "distinct surface."
- Inside a `Card`/`CardContent`, separate sub-groups with dividers, plain
  rows, spacing, or `FieldGroup` — never more cards. Smell to catch:
  `rounded-*` + `border` on a child of `CardContent`.
- Same for tint: one tinted level. Do not stack a tinted callout inside a
  tinted card inside a tinted section.

## RULE 9: Annotation register — read every visit, or once?

- Before adding help/description text to a control or panel, ask: will the
  user read this EVERY visit, or ONCE?
- Deliberative surfaces read once (settings, forms, onboarding, config
  editors): annotate each control — help text is correct here.
- Glanceable surfaces read constantly (dashboards, monitors, live views,
  status boards): labels and values ONLY. Do NOT put an always-on
  explanatory sentence on a live metric or panel — move it to a tooltip or
  info affordance. An operator does not re-read a paragraph every few
  seconds.
- If the sentence would be read on every visit, it is clutter, not
  annotation. Remove it.

## RULE 10: Fill horizontal space with new info or whitespace — never duplicate data

- Do NOT render the same datum twice to fill horizontal space. A sidebar
  that re-plots numbers the main table already shows is a defect — a panel
  invented to fill width.
- Every datum appears ONCE, unless a second view adds a distinct affordance
  (an overview you can drill into, a different encoding revealing something
  the first can't). "The right side looked empty" is NOT a valid reason to
  duplicate — use whitespace or different information instead.

## MANDATORY pre-ship checklist — run this explicitly before calling any screen done

- [ ] Every color on screen means the same thing everywhere else it's used.
- [ ] Every badge/pill/indicator's displayed text can actually change.
- [ ] Zero shadows exist without a stated elevation/interaction reason.
- [ ] Zero eyebrow/description lines restate the title.
- [ ] Every icon is functional wayfinding, or it has been removed.
- [ ] Grid/layout weight was chosen based on real content priority, not
      copy-pasted from the last screen.
- [ ] Every animation ties to a real, stated state change.
- [ ] No card nested inside a card; sub-groups use dividers/rows/FieldGroup.
      One tint level only.
- [ ] Annotation density matches surface cadence — help text on read-once
      surfaces (settings/forms), labels-only on glanceable ones (dashboards).
- [ ] No datum rendered twice to fill space; every panel shows something
      the others don't.

If ANY box is unchecked, fix it before reporting the task complete. Do not
report a screen as done with known checklist failures "to be polished
later" — fix them now, in the same change.
