---
name: ux-design-language
description: Use when designing or reviewing any screen — dashboards, tooling, showcase pages, forms — in this template or a project scaffolded from it. Triggers on "design this screen", "review the UI", "does this look right", "add a badge/label/indicator", or before adding any visual element (color, shadow, badge, icon, gradient) to a page. The core question this skill answers is "does this visual element earn its place, and does it mean exactly one thing."
---

# UX design language

Everything on screen is data visualization. Every color, shape, size,
position, motion, and unit of text is either communicating something real
or it's noise competing with the things that are. This skill is the check
you run before adding — or when reviewing — any visual element.

This matters most in dashboards and internal tooling (this template's
showcase pages, admin panels, config editors) because there's no marketing
narrative to hide behind. If a badge doesn't mean anything, there's nothing
else on the page to distract from that.

## The one question

For every visual element you're about to add, ask: **what does this
communicate, and does it communicate exactly one thing?**

- A color that sometimes means "success" and sometimes means "primary
  brand accent" is communicating nothing — the viewer can't learn what it
  means because it doesn't consistently mean anything.
- A badge whose text never changes is decoration wearing information's
  clothes. Delete it or wire it to real state.
- A shadow on every card, regardless of whether that card is elevated,
  interactive, or floating above other content, means nothing — it's just
  texture. Reserve shadows for actual elevation/interaction cues.

If you can't answer "what does this communicate" in one sentence, don't add
it.

## Concrete checks, in order

### Color
- Each token means one thing across the whole app: `text-destructive` is
  always error/danger, `text-primary` is always the active/selected/on
  state, chart-* tokens are always the same data series. Don't introduce a
  second meaning for a color that already has one.
- Challenge default AI-generated palettes (Tailwind blue `#3B82F6`
  especially) when there's no brand or system rationale for that specific
  hue — this template's tokens (amber/copper/midnight/etc, see
  `apps/web/src/styles/themes.css`) exist precisely so you don't reach for
  an arbitrary blue.
- Raw Tailwind colors (`bg-amber-400`, `text-yellow-500`) are acceptable
  only where there's genuinely no semantic token for the job (e.g. a
  status/severity taxonomy like `ValidationMessage`'s error/warning/info) —
  and even then, isolate them in one shared variant map
  (`lib/value-status.ts` is the pattern), not scattered inline across
  components.

### Shadow and elevation
- No box-shadow on every surface by default (logo, background, card, icon).
  A shadow says "this is above the surface, closer to the viewer, probably
  interactive or floating." If everything has one, nothing does.
- Reserve shadows for genuine elevation: popovers, dropdowns, dragged
  items, actively-focused cards in a stack.

### Content hierarchy — the over-labeling trap
- Don't stack eyebrow + title + description + a paragraph when the title
  alone already carries the message. Every additional line is something the
  reader has to decide is worth reading.
- No generic emoji badges or icon-only decoration unless it's an
  established part of the product's visual language (this template's
  showcase icons are functional nav wayfinding, not decoration — see
  `extending-this-template` skill Rule 3.3).
- A badge, pill, or status indicator must display a value that can change.
  If it always renders the same text, it's not a badge, it's a label —
  either make it dynamic or delete it and use plain text.

### Layout rhythm
- Avoid reflexive uniform 3-or-4-column grids when the content itself has
  unequal weight. A dashboard where every card is identically sized implies
  every card is equally important — is that true?
- Asymmetry, bento-style grouping, or varied card weights are correct when
  they reflect real information priority, not when applied for visual
  interest alone.

### Containers and nesting
- A card is one elevation level. Don't nest bordered or tinted sub-cards
  inside a card — a card of cards reads as noise, and if every group is a
  card, "card" stops meaning "distinct surface." Inside a card, separate
  sub-groups with dividers, plain rows, spacing, or a `FieldGroup`, not more
  cards. (Smell: `rounded-*` + `border` on a child of `CardContent`.)
- One tint level, too. A tinted callout inside a tinted card inside a tinted
  section is three claims of "this is special" that cancel out.

### Annotation register — read every visit, or once?
- Match explanatory text to how often the surface is read. **Deliberative
  surfaces are read once** (settings, forms, onboarding, config editors) —
  annotate each control; help text earns its place. **Glanceable surfaces
  are read constantly** (dashboards, monitors, live views, status boards) —
  labels and values only. An operator scanning queue health every few
  seconds does not re-read "Attention combines depth growth, worker
  shortfall, oldest-job age, and retry pressure" each time — move that to a
  tooltip or an info affordance, never always-on prose.
- The test: *will the user read this sentence on every visit, or once?* If
  every visit, it isn't annotation, it's clutter — demote it.

### Horizontal space and duplication
- Fill horizontal space with **different information, or whitespace** —
  never a second rendering of data already on the page. A summary/detail
  split is fine; a sidebar that re-plots the numbers the table already shows
  is a panel invented to fill width — noise wearing a layout's clothes.
- Every datum appears once unless a second view adds a distinct affordance
  (an overview you can drill into, a different encoding that reveals
  something the first can't). "It looked empty on the right" is not a reason
  to duplicate.

### Gradients and motion
- Tone down extreme gradients unless the product's brand deliberately owns
  that visual language (check `themes.css` — none of this template's seven
  themes lean on heavy gradients as their identity).
- Motion (transition, animation) must encode a process or state
  transition — a value changing, a panel opening, a decision not yet
  committed (see `RangeTrack`'s pulse-while-uncommitted). Motion that's
  purely decorative (a shimmer with no state behind it) is noise.

### Typography register
- Body copy has a sensible minimum size for its script (≥14px English body
  text as a floor; smaller is acceptable only for genuinely secondary
  metadata like timestamps or the 9–11px mono readouts used throughout this
  template's instrument-panel components, which are deliberately
  dense/technical, not primary reading content).
- Monospace/`font-mono` signals "infrastructure, data, code" — file paths,
  numeric readouts, status strings. Proportional/system font signals
  "content for a human to read." Don't mix registers arbitrarily; the
  choice itself is information.

## Applying this to dashboards and tooling specifically

A dashboard's whole job is showing you what changed and what needs
attention. Every element competes for that job:

- If two widgets use the same visual weight (same size, same color
  intensity, same border treatment), you're claiming they're equally
  important. Is that true, or did you just copy-paste the same
  `ExhibitCard` shape without thinking about priority?
- A number with no context (no delta, no threshold color, no trend) is
  barely more useful than no number — consider whether it needs a
  comparison, not just a fresh coat of paint.
- Empty states are not "nothing to show" — they're the first thing a new
  user sees. An empty state that just says "No items" wastes the
  opportunity to teach or guide; but adding an illustration/badge/eyebrow
  to it "to make it feel finished" fails the same test as everywhere else —
  does this specific addition communicate something the words don't?

## Before-you-ship checklist

- [ ] Every color on this screen means the same thing everywhere else it
      appears in the app.
- [ ] Every badge/pill/indicator displays a value that can actually change.
- [ ] No shadow exists without a reason (elevation, interactivity, drag).
- [ ] No eyebrow/description text repeats what the title/layout already say.
- [ ] Every icon is either functional wayfinding or decorative-and-cut.
- [ ] Grid/layout weight reflects real information priority, not habit.
- [ ] Motion, where present, ties to a real state change.
- [ ] No card nested inside a card (one elevation level); sub-groups use
      dividers/rows/`FieldGroup`. One tint level.
- [ ] Annotation density matches the surface — help text on read-once
      surfaces (settings/forms), labels-only on glanceable ones (dashboards).
- [ ] No datum rendered twice to fill space; every panel shows something the
      others don't.

If a screen fails more than one of these, stop and fix the design before
writing more component code — polishing code on top of an unjustified
layout just makes the unjustified layout harder to remove later.
