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

## The four burdens of proof

Every element in a UI must prove:

1. **Necessity** — what capability, state, navigation, or necessary copy would
   be lost if it disappeared?
2. **Irreducible friction** — why can the clicks, typing, decisions, travel,
   waiting, or cognitive load required to use it not be reduced?
3. **Compact and intuitive expression** — why can the same capability not use
   fewer surfaces, steps, words, or space, or a more familiar interaction?
4. **Objective-relative position** — why does it earn this location, order,
   size, and visual weight compared with everything else the user needs to
   achieve their objective on this surface?

Run these before color, spacing, component choice, or polish. An element can be
useful in isolation and still be wrong because it is too prominent, too early,
too large, or too costly relative to the user's task.

- If necessity is weak: delete it.
- If friction can fall: shorten, default, automate, autocomplete, or remove a
  step.
- If expression can compress: combine or redesign it.
- If position is unearned: demote, move, resize, or reveal it contextually.

Frequency changes placement, never quality. A low-frequency task uses one of
three homes:

1. a compact, clearly labeled affordance that reveals it on invocation;
2. progressive or contextual disclosure at the moment it becomes relevant; or
3. a separate configuration screen or panel when it is a distinct task.

It does not remain permanently expanded because that was easiest to implement.
It still carries the full interaction-quality burden; because users cannot rely
on muscle memory, an infrequent task often needs more familiar conventions,
clearer state, and lower relearning cost. Persistent primary placement is
reserved for continuously relevant state, serious risk prevention, or
essential discoverability.

Compact does not mean cramped or cryptic. It means no element, step, or word
stands between the user and the task without earning that cost. Intuitive means
the affordance carries its own operation through convention, placement, state,
and feedback rather than explanation.

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

## Every surface is an affordance unless it is explicitly copy

A surface must accept input, expose state, enable navigation, or establish
manipulable structure. If its purpose is prose, classify it as a deliberate
copy surface and make it justify the space it occupies. Explanation is not a
neutral filler state and must never masquerade as interface.

- Treat every rendered static string and every badge with the same suspicion as
  `useEffect`: allowed, but only with a concrete justification that survives
  review. "Helpful," "clearer," "looks finished," and "adds hierarchy" are not
  sufficient.
- A bordered panel that only explains nearby controls is a copy surface, not a
  tool. Delete it, move the material to documentation or contextual help, or
  turn the panel into an actual control/state surface.
- A row implies inspection, selection, navigation, or manipulation. If none is
  possible, the row-shaped treatment is a false affordance.
- A chip implies state, filtering, selection, or removal. Static taxonomy text
  should not borrow the shape of a control.
- A badge must encode changing state, selection, filtering, removal, or another
  real affordance. Static taxonomy or emphasis should be plain text or deleted.
- Empty space is preferable to a surface invented to hold explanation.

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
  established part of the product's visual language (the `_app` sidebar's
  nav icons are functional wayfinding, not decoration — see the
  `extending-this-template` skill).
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

### Permanent-copy budget — tooling is not documentation

- Tooling surfaces start with a permanent explanatory-copy budget of
  **zero**. A sentence earns permanent space only when it is:
  1. the control's actual label;
  2. live state or a value the user must inspect;
  3. a warning needed to prevent an imminent, consequential mistake; or
  4. an instruction without which the current task cannot be completed.
- Settings and forms are still tooling. Do not annotate every control merely
  because a user may visit the page infrequently. A clear label, familiar
  control, useful placeholder, grouping, and immediate validation should carry
  the interaction.
- Architecture, ownership, persistence semantics, implementation details, and
  "what this screen does" prose belong in documentation, contextual help, or a
  tooltip—not permanently between controls.
- Do not use prose to compensate for weak hierarchy or an unfamiliar control.
  Repair the hierarchy or control. If a control needs a paragraph to explain
  how to operate it, the control is unfinished.
- Explanatory copy that appears only after a relevant action, error, dangerous
  choice, or empty state is contextual rather than permanent and may earn its
  place. Keep it specific to the moment.
- Use professional creative tools such as Blender as the density reference:
  labels, values, menus, affordances, and live status dominate; tutorial prose
  does not occupy the working surface.
- Review every permanent sentence with the deletion test: remove it and attempt
  the task. If the task remains clear and safe, delete the sentence.

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

- [ ] Every element proved necessity.
- [ ] Every interaction's friction is irreducible or deliberately constrained.
- [ ] No more compact and intuitive expression preserves the same capability.
- [ ] Every element earns its location, order, size, and visual weight relative
      to the user's objective.
- [ ] Low-frequency tasks are invoked contextually without lowering their
      interaction-quality or intuitiveness bar.
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
- [ ] Every permanent sentence passes the tooling-copy test: label, live state,
      necessary warning, or indispensable instruction.
- [ ] Every surface is an actual affordance or an explicitly justified copy
      surface; no explanation masquerades as interface.
- [ ] Every static string and badge has a reviewable justification; badges
      encode real state or affordance rather than decorative taxonomy.
- [ ] No prose compensates for a weak hierarchy, ambiguous affordance, or
      unfamiliar interaction; the control itself was repaired.
- [ ] No datum rendered twice to fill space; every panel shows something the
      others don't.

If a screen fails more than one of these, stop and fix the design before
writing more component code — polishing code on top of an unjustified
layout just makes the unjustified layout harder to remove later.
