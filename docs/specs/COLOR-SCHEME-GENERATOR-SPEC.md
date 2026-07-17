# Color-Theory Scheme Generator — Spec

> Date: 2026-07-09
> Status: Draft for approval
> Branch (planned): `feat/color-schemes` (off `feat/theme-studio` / `dev`)
> Scope: an accent-palette generator inside the Theme Studio that turns a seed
> color into `n` harmonious, legible, semantically-aware accent colors, driving
> both the data-viz palette and named UI accent tokens.

## 1. Summary

Duotone, multi-color, and the chart palette are one feature at different `n`.
A **color-theory scheme engine** turns a seed (or a set of labels) into a
coherent palette: harmony rules for small `n` (aesthetic), perceptual
max-distance spread for arbitrary `n` (categorical), every color auto-fit for
WCAG legibility on the surrounding surfaces and kept out of the reserved status
bands.

**Delivery model: micro color islands (David, 2026-07-09).** The engine ships
primarily as a **scoped primitive** — a block or view wraps a subtree in a
`ColorScope` ("color island") and gets a self-contained local palette. Islands
are INDEPENDENT: collision-avoidance is *within the island* + the reserved
status bands only. There is deliberately **no global cross-theme color budget**
(David: "more complicated than it's worth") — two islands may reuse hues, and
that's fine because they're visually separated scopes. The Theme Studio is one
consumer of the same engine (theme-level accents + chart palette); scoped
islands are the general capability.

This is the concrete, near-term slice of the roadmap's "generative theming"
item. It is NOT the whole-theme/ typography engine (that stays deferred, §9).

## 2. The model

```
seed color ──▶ harmony strategy ──▶ n raw hues ──▶ per-accent legibility fit ──▶ n accents
                (auto | override)                    (contrast + semantic guard)
```

- **Seed:** a single base color (defaults to the theme's signal, or a picked
  color). Expressed in HSL for rotation math; the engine is pure (`lib/color-scheme.ts`).
- **`n`:** 2 (duotone) … ~5, with 3 the recommended/ default sweet spot. The UI
  soft-warns above 4 ("harmonies degrade past ~4 hues").
- **Output:** an ordered `Accent[]` of `{ hex, hue, role? }`, deterministic for a
  given (seed, strategy, n, mode).

## 3. Harmony strategies

Pure hue-rotation rules off the seed hue `h`:

| Strategy | Hues (for n up to sweet spot) |
| --- | --- |
| Complementary | `h`, `h+180` |
| Analogous | `h`, `h±30`, `h±60` |
| Triadic | `h`, `h+120`, `h+240` |
| Split-complementary | `h`, `h+150`, `h+210` |
| Tetradic (n≥4) | `h`, `h+90`, `h+180`, `h+270` |

**Auto selection (default):** pick the strategy that yields `n` visually
distinct AND legible colors for the seed — heuristic: maximize the minimum
pairwise hue separation and minimum surface-contrast across the set, subject to
`n`. `n=2 → complementary/split`; `n=3 → triadic/split`; `n=4 → tetradic`.
User can override to any named strategy in the Studio.

## 4. Legibility (reuse, don't reinvent)

Each generated accent is adjusted for the **active mode** using the Studio's
existing `darkenToContrast` / `contrastRatio` machinery (`theme-derive.ts`):
lightness is nudged until the accent clears the target ratio as fill/text on the
mode's surface (AA 4.5 default; configurable). Harmony sets the hue; legibility
sets the lightness. This guarantees a generated palette is always usable, the
same "provably legible" property the Studio already enforces for the signal.

## 5. Semantics — stable + connotation-safe (David's call: both)

- **Stable label→color:** when a scheme is generated from a set of LABELS (the
  categorical case — data series, entity kinds, categories), a given label
  always maps to the same slot deterministically (hash(label) → stable index
  into the generated ramp). `us-east` is the same hue in every view that uses
  the same island config. `colorFor(label)` is the accessor; order-independent
  and stable across renders/reloads.
- **Reserved-hue guard (connotation-safe):** status hues are reserved so
  generated colors don't read as system state — nothing lands within a
  tolerance band of destructive/red, success/green, warning/amber, info/blue
  (the `--color-*` status tokens). On collision the engine nudges the hue out of
  the band (or drops that slot and re-picks) and logs the adjustment.
- **Mood weighting:** an optional bias axis (warm↔cool / calm↔energetic) that
  weights strategy + hue selection (e.g. "energetic" favors triadic/wider
  separation; "calm" favors analogous/tighter). A small labeled control, not a
  free-form psychology model — honest and verifiable.

## 5b. Two generation regimes (shared guards)

Both share §4 legibility + §5 semantics; they differ only in how hues are chosen:

- **Harmony** (small `n`, ~2–3, aesthetic) — hue rotation off the seed (§3).
  For accents/duotone/small chart sets where "related and pretty" matters.
- **Categorical** (arbitrary `n`, "matched semantics, no collision") — max-min
  distance spread in a **perceptual** space (OKLab / CIEDE2000): place `n` hues
  so the minimum pairwise perceptual distance is maximized, then legibility-fit
  and reserved-guard each. For many-series data / entity palettes where every
  color must be tellable apart. `distinctColors(n, surfaces, reserved) → hex[]`.

The engine picks the regime by intent: a seed + harmony → harmony; a label set
or large `n` → categorical. Collision-avoidance (mutual perceptual distinctness)
is **island-local**, never global (§1).

## 6. Delivery — scoped color islands (primary) + theme consumers

**Primary form: `ColorScope` (the color island).** A `packages/ui` primitive
that wraps a subtree, generates a local palette from its props, and exposes it
as **scoped CSS custom properties on its own container** (not `:root`), so the
palette is local to that block/view and cannot leak or collide globally:

```tsx
<ColorScope seed="#d4a853" strategy="auto" n={3} mood="calm">
  {/* children read --scheme-1..n / bg-scheme-2 etc., scoped here */}
</ColorScope>

// categorical, label-driven, stable:
<ColorScope labels={series.map(s => s.id)}>
  {series.map(s => <Line color={`var(--scheme-${scope.indexFor(s.id)})`} />)}
</ColorScope>
```

- `useColorScheme({seed|labels, strategy, n, mood})` — the hook behind it;
  returns `{ colors, colorFor(label), cssVars }`. Pure over the engine.
- Scoped vars (`--scheme-1..n`, `--scheme-1-foreground`) are set via inline
  style on the scope element — no `globals.css` slots, no global reservation,
  islands independent by construction.

**Theme-level consumers (same engine, global scope):**
- **Chart palette** — the Studio can drive `--color-chart-1..n`, replacing the
  naive signal-hue ramp in `derive()`. First-class ("useful for charts").
- **Theme accents** — optionally a small fixed set of theme accent tokens
  (`--color-accent-1..n`, base+bridge in `globals.css`) if a theme wants named
  accents beyond `primary`. Lower priority than the island primitive.
- **Link/unlink** (Studio): charts + theme accents may share one generated set
  or be authored separately.

## 7. Studio integration

- A new **"Scheme" panel** in the Theme Studio: seed swatch, strategy select
  (Auto + the named harmonies), `n` stepper (2–5, default 3), mood control, the
  link/unlink toggle, and a live legibility/contrast readout per accent (reusing
  the existing readout component).
- **Preview:** the accent swatches + the chart previews update live off the
  generated set (deferred, like the existing charts, to stay responsive).
- **Persistence:** the scheme (seed, strategy, n, mood, link state) is part of
  the theme definition — exported in the CSS/JSON and written by the dev-only
  **save-to-source** path (§ Theme Studio Tier 2) so a generated scheme becomes
  a real built-in. `PRESETS`/`THEMES` entries gain the scheme fields.

## 8. Testable seams (pure functions, unit-tested)

- `harmony(hue, strategy, n) → number[]` — hue math, deterministic.
- `selectStrategy(seed, n) → strategy` — auto-selection heuristic.
- `distinctColors(n, surfaces, reserved, mood) → hex[]` — categorical max-min
  perceptual-distance spread (OKLab/CIEDE2000).
- `reserveSemanticHues(hues, statusHues, tol) → hues` — collision guard.
- `fitAccent(hue, sat, surface, mode, target) → hex` — legibility fit (wraps
  existing contrast utils).
- `stableIndex(label, n) → int` — deterministic hash for stable label→slot.
- `generateScheme({seed|labels, strategy, n, mood}, surfaces, statusHues)
  → { colors, colorFor }` — the composed pipeline (harmony or categorical).
All pure, no DOM; unit tests assert hue separation / min perceptual distance,
AA-legibility of every color on light+dark surfaces, semantic-hue avoidance,
label→color STABILITY (same label ⇒ same color across calls), determinism, and
the n-degradation soft-warn boundary. The `ColorScope` primitive + `useColorScheme`
hook get a component test (scoped vars present on the container, not `:root`).

## 9. Non-goals (deferred, roadmapped)

- The **whole-theme generation** engine (pin-derive constraint solving +
  type-scale/typography). This spec is accents only; surfaces/ink/signal still
  come from the existing derivation.
- Free-form / ML color-psychology. §5 is a bounded, labeled weighting, not a
  model.

## 10. Verification

- Unit tests per §8 (pure math + legibility + semantics + determinism).
- `pnpm --filter web build` 0; design-lint 0.
- Real browser: generate schemes across seeds/strategies/n in BOTH modes;
  confirm every accent is legible (contrast readout), reserved hues are avoided,
  charts + UI accents update, link/unlink behaves, and a generated scheme
  save-to-source produces a selectable built-in with the accents intact.
