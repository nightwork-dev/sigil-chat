# Component consolidation sweep — 2026-07-15

A pass over the newer `packages/ui` components for (1) duplication —
what should be standalone vs folded into an existing component as a
variant/block/molecule — and (2) taxonomy mess. Grounded in reading the
actual source (six parallel cluster reads), not names.

## Headline

**Very little is copy-paste *component* duplication.** The factoring is
mostly deliberate and documented — back-compat shims, part/whole splits,
data-driven adapters, and a spec-cited 3-tier composition model. The real
issues are narrower:

1. **Shared low-level code copied instead of extracted** (drag math, an
   edge-fade scroll mask, two menu class recipes, a badge render shell).
2. **The taxonomy fights itself** — a 34-entry `NAME_OVERRIDE` table in
   `landing.tsx` exists because the *source-folder* layout and the
   *category* layout disagree. That table is the smell, not any one file.
3. **Surface inflation** — back-compat shims and thin wrappers each take a
   first-class showcase slot.

So the answer to "standalone vs integrate" is mostly: **keep them
standalone, but extract the shared internals.** Only a few are genuine
merge candidates.

## Verification update (2026-07-15, after first implementation pass)

Grounding several of these against the real source (and edge cases) shrank
the duplication list further — a few flagged "dedups" were superficial
overlap, not real:

- **DONE — A1 menu class recipe:** extracted to `lib/menu-classes.ts`;
  `dropdown-menu`/`context-menu` now share it, output byte-identical
  (verified token-multiset per element). Registry auto-wired the dep.
- **DONE — A2/#6 badge adapters:** `RampBadge` folded into `status-badge.tsx`
  (one registry entry, one adapter family). `ramp-badge` deleted. Both
  resolvers + tests green. (Purpose of RampBadge, for the record: numeric
  value → severity-tier badge, e.g. load% → green/amber/red.)
- **DONE — display shims (#5):** `lcd-display`/`nixie`/`led-segment`/`vfd`
  deleted; showcase uses `<Readout variant>` directly.
- **REVISED — A4 (range-track ↔ pinnable-track): NOT a dedup.** They render
  differently by design — RangeTrack is a `w-px` needle; PinnableTrack.Track
  is a solid fill to value with `statusFillVariants` + `ConflictMark`. The
  original read overstated the overlap. No change; both kept.
- **REVISED — A5 (shared drag hook): NOT a safe dedup.** The local
  `clamp`/`snap`/coord helpers in the editors intentionally propagate `NaN`
  (and handle zero-rect / zoomed-SVG differently) where `lib/interaction.ts`
  resolves `NaN` to a bound. Swapping would change behavior. Left as-is.
- **REVISED — A3/#7 (validity-chip on Badge): net negative.** Badge is
  `font-medium` / single `h-5` / `overflow-hidden` / forced svg-size;
  validity-chip is `font-mono` + `tabular-nums` + two sizes + directional
  glyphs. Composing means overriding most of Badge for ~5 shared tokens.
  validity-chip stays standalone; its coherence goal moves to the temporal
  family work (D2 / task #9).

Net: the still-live, worth-doing items are **A7 (ColorSwatch reuse)**,
**A6 (edge-fade-scroll hook, watch-item)**, **A8 (bezier Curve.Root dup)**,
**B1 (popover-edit collapse)**, and the **taxonomy pass (D)** — plus the
design work in **D2 / temporal family**. The heavier "shared internals"
extractions (A4/A5) were false positives.

---

## A. Real duplication — extract the shared internal (keep both components)

Ranked by confidence / payoff.

1. **`context-menu.tsx` ⟵ `dropdown-menu.tsx` class recipes.** Both hand-copy
   the same `Content` glass-popup string and the same 4-token `Item` recipe
   (`focus:bg-accent … data-[disabled] …`) over two different base-ui
   primitives (`menu` vs `context-menu`). `menubar.tsx` already imports
   dropdown wholesale (good). **Fix:** hoist the shared className strings to
   one `menu-surface` constants module; both wrappers reference it. Keep both
   components — they wrap different primitives.

2. **`status-badge` + `ramp-badge` — one render shell, two resolvers.** Both
   are literally `<Badge variant="outline" className={resolved.className}>{glyph}{label}</Badge>`
   with a `<Badge variant="secondary">` fallback. Only the resolver differs
   (string→variant map vs numeric→ramp step). **Fix:** one badge-adapter
   render; keep `resolveStatusVariant` and `resolveRampStep` as the two
   exported resolver functions. Highest-confidence merge in the sweep.

3. **`validity-chip` re-implements the `Badge` pill.** Its own CVA duplicates
   Badge's `rounded-full border … text-[0.625rem]` geometry + `h-4`/`h-5`
   sizing. The 4-state temporal enum (`active/not-yet/ended/indeterminate`)
   and glyphs are real, distinct behavior worth keeping. **Fix:** rebuild it
   as a `Badge` composition (state → variant + glyph), keep `ValidityState`/
   `stateWord`.

4. **`display/range-track` ⟷ `tweak/pinnable-track`.** `RangeTrack` is the
   read-only needle/span renderer; `PinnableTrack`'s non-pinned `Track` branch
   re-implements the same needle-for-point / filled-span-with-edge-ticks
   drawing. **Fix:** `PinnableTrack.Track` composes `RangeTrack` for the
   display layer and adds only the pinned/feasible/interactive overlays.

5. **Drag arithmetic copied across ~6 editors.** `clamp`/`snap`/`pct`, the
   pointer→normalized-coordinate formula, and the global-`mouseup`
   drag-release are re-declared in `bezier-curve-editor`, `creative/vector-editor`,
   `creative/gradient-editor`, `tweak/commit-handle`, `tweak/scrubber`, and
   `time-scrubber` (vector-editor's comment even names bezier-editor as the
   source). **Fix:** one shared drag hook (pointer-capture + normalized coord
   + drag lifecycle). `useBoundedVector` is prior art — only `color-input`
   uses it today. There is **no** single "SVG-path points" *component* to
   extract (substrates diverge: SVG / canvas / CSS-div) — it's a hook, not a
   component.

6. **`era-band` ⟵ `pill-bar` edge-fade scroll mask** (self-flagged in
   `era-band.tsx:89`: "replicated (NOT extracted) from pill-bar"). Same
   `measure`/`FADE_PX`/ResizeObserver block. `era-band` + `time-scrubber` also
   share a hatch + soft-edge-mask idiom. **Fix:** extract a
   `useEdgeFadeScroll` hook (the file itself says the 3rd caller is the
   tipping point — this is caller #2, so this one is a *watch item*, cheap to
   do now).

7. **`ColorSwatch` is bypassed.** `color-wheel`, `color-input`, and
   `color-scope.Swatches` each hand-roll their own swatch `<div>` instead of
   using the `ColorSwatch` atom. **Fix:** route all three through `ColorSwatch`.

8. **Internal: `bezier-curve-editor` builds two near-identical `Curve.Root`
   value objects** (~18 lines each, canvas + list). Hoist to one memoized
   value.

---

## B. Over-fragmentation — collapse to variants

1. **`popover-edit-select` + `popover-edit-slider`.** `popover-edit` is a
   correctly-factored transactional shell (owns draft/commit once). But the
   two wrappers forward the *same 7 props in the same order* and differ only
   in `T` and one control (RadioGroup vs Slider). **Fix:** either fold them
   into `PopoverEdit` variants (`type: "select" | "slider"`), or drop both and
   let callers pass their own control into the shell. Three files for two JSX
   controls is over-split.

2. **Display back-compat shims** (`lcd-display`, `nixie`, `led-segment`,
   `vfd`). These are intentional zero-logic aliases over `<Readout variant>` —
   *not* duplication. But their **only in-repo consumer is the showcase demo
   itself** (`showcase/displays.tsx`); each takes a standalone showcase slot,
   inflating the Displays count. **Fix:** keep them as thin aliases for
   external registry consumers, but demote them to variant demos *under*
   Readout in the showcase rather than five first-class exhibits.

---

## C. Keep standalone — correctly factored (NOT duplication)

These read like duplication by name but aren't; leave them:

- **`command` / `command-menu` / `command-palette`** — `command` is the base
  layer; the other two are genuinely distinct (local fuzzy hierarchy vs async
  remote search) and self-justify in their headers. (Minor: both inline a
  `Dialog` shell that overlaps `CommandDialog`, and each wires Cmd+K
  differently — worth unifying, low priority.)
- **`radial-context-menu`** — shares nothing with `context-menu` but the word
  "menu" (hand-rolled portal vs base-ui). Island.
- **`bezier-curve` ⟷ `bezier-curve-editor`** — part/whole (compound primitive
  + orchestrator), both editable. `viz/curve-viz` is the read-only sibling on
  a different substrate (VizFrame + d3). All three stay.
- **Color family roles** — `color-swatch` (display), `color-scope` (palette
  generation), `color-wheel` + `color-input` (two HSB picker surfaces). Three
  distinct roles; keep (see A7 for the one shared-atom fix).
- **`argument-field` ⟵ `cli-argument-builder`** — correct extraction (the
  compound row was pulled out of the builder and imported back). Keep. Note
  the builder is a *feature composition*, not a base primitive.
- **`click-to-edit`** — different interaction model (in-place input swap) and
  commit API than the popover-edit family. Independent.
- **`status-dot`** — a dot, not a pill. Not a Badge variant.
- **`data-label`, `data-format-editor`, `entity-panel`, `template-resolver`,
  `key-value-editor`, `validated-draft`** — all domain-free reusable
  components.
- **`timeline` + `timeline-inspector`** — one tightly-coupled domain (timeline
  imports and re-exports the inspector; both bind `lib/timeline/schedule`).
- **`views/` / `blocks/` / `layouts/`** — a deliberate, spec-cited 3-tier
  model (Layout = chrome, View = swappable content surface, Block = molecule),
  surfaced in the separate `/gallery` route. Coherent. (One caveat: `views/`
  are page-scale and pull cross-package material — awkward in a *flat*
  component export, but decoupled-by-props and load-bearing in real routes.)

---

## D. Taxonomy fixes (the "messy" part)

1. **The `NAME_OVERRIDE` table (34 entries) is the root smell.** It exists
   because source-folder ≠ category. Every override is a file demoed away from
   the folder it physically lives in (e.g. `range-slider`/`pinnable-track`/
   `commit-handle` sit in `tweak/` but are overridden to `constraints`).
   **Options:** (a) move the clear cases into folders that match their category
   so `FOLDER_CATEGORY` handles them and the override table shrinks toward
   zero (structural fix — the real guard); or (b) accept overrides as
   intentional "demo-away-from-folder" and stop growing the folder set. Pick
   one policy; right now it's both, which is why it feels messy. Recommend
   (a) for the constraints cluster specifically (add a `constraints/` folder).

2. **The `temporal` category is a weak grouping.** Of its four members
   (`validity-chip`, `era-band`, `time-scrubber`, `attention-tile`), only
   `era-band` + `time-scrubber` share a domain (axis surfaces, and they share
   copied visual idioms). `attention-tile` has *nothing* temporal in it (a
   generic count/items tile, compares itself to `Card`/`ExhibitCard`) → move to
   `feedback` or `layout`. `validity-chip` is temporal-*semantic* but is
   badge-shaped → it reads as a Badge, not an axis display. **Fix:** shrink
   `temporal` to the axis surfaces; relocate `attention-tile`.

3. **Two components named "scrubber."** `time-scrubber` (snap-to-stops
   timeline cursor) vs `tweak/scrubber` (numeric pixel-nudge form control) —
   zero shared code, pure name collision. **Fix:** rename `tweak/scrubber` →
   `value-scrubber` (or `number-scrubber`).

4. **`scroll-spy` mislabels.** It's a flat file with no `NAME_OVERRIDE`, so
   `categorize()` buckets it as `primitives` — even though it's listed as a
   Guide representative in `CATEGORIES.guide`. **Fix:** add
   `"scroll-spy": "guide"` to `NAME_OVERRIDE`.

5. **`guide-shell` hand-rolls an IntersectionObserver** that now duplicates
   the extracted `useScrollSpy` hook (`article-shell` already consumes the
   hook; `scroll-spy.tsx` is the extracted component). **Fix:** refactor
   `guide-shell` onto `useScrollSpy`.

---

## Suggested order of execution

Cheap + high-value first:
1. A2 (status/ramp badge merge), A7 (ColorSwatch reuse), C-confirmations, D3
   (rename), D4 (scroll-spy label) — small, isolated.
2. A1 (menu class constants), A3 (validity-chip on Badge), A4 (range-track
   composition), B1 (popover-edit collapse) — component-local refactors.
3. A5 (shared drag hook) — touches ~6 files; do as one focused pass.
4. D1 (folder↔category realignment) + D2 (temporal reshape) + B2 (Readout
   demo demotion) — the taxonomy pass; do last so the code is stable first.

Each is independently shippable. None is a rewrite.
