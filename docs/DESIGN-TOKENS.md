# Design Tokens Spec — Material Language

> Author: Neve Laine
> Date: 2026-03-22
> Status: Draft
> Scope: Cross-project design system. Applies to all web (CSS/Tailwind), iOS (SwiftUI), and future native targets.

---

## 1. What This Is

A material language that has converged across five projects independently. This spec codifies what already exists, names the principles behind it, and defines a variant system for generating new palettes that belong to the same family.

The palette is not a color scheme. It's a thermal envelope — a set of surfaces, signals, and seams that share a consistent physical temperature. Every element in the system is thermally related. Nothing is cold by accident.

### Projects using this language

| Project | Platform | Source |
|---------|----------|--------|
| Flash-MoE Playground | Web (TanStack Start) | `ai/flash-moe/playground/src/index.css` |
| Flash-MoE iOS | SwiftUI | `ai/flash-moe/ios/FlashMoE/Theme.swift` |
| Voice Studio | Web (Vite/React) | `ai/voice-studio/src/index.css` |
| Dev Dashboard | Web (TanStack Start) | `apps/dev-dashboard/packages/ui/src/styles/globals.css` |
| TanStack Start Template | Web (template) | `templates/sigil-design/packages/ui/src/styles/globals.css` |
| Knowledge (Loom) | Web (TanStack Router) | `ai/knowledge/app/src/index.css` — **variant** (cooler, agent-colored) |

---

## 2. Canonical Palette — "Amber"

The default. The one that converged naturally. Named "Amber" after its signal color.

### 2.1 Surface Stack

Surfaces are an elevation ramp from void to raised. Each step is warmer and lighter than the last, but all stay in the same thermal register. The purple undertone is structural — it prevents the darks from feeling cold or clinical.

| Token | Hex | HSL (approx) | Role |
|-------|-----|--------------|------|
| `void` | `#0d0b0f` | 270° 18% 4% | The deepest surface. Page background. The turned-off screen. |
| `ground` | `#121014` | 270° 14% 7% | Sidebar background. One step above void. |
| `surface` | `#151216` | 280° 12% 8% | Card background. The thing you put things on. |
| `raised` | `#1a1620` | 265° 13% 11% | Muted areas. Hover states on surface. |
| `elevated` | `#1e1a20` | 270° 10% 11% | Secondary background. Active sidebar items. |

The ramp: `void → ground → surface → raised → elevated`. Each step increases lightness by ~3% and decreases saturation slightly. The hue stays in the 265-280 range (blue-purple).

**Rule: no surface in the stack should have a hue below 260 or above 285.** That's the purple corridor. Drift below 260 and it goes blue-cold. Drift above 285 and it goes pink-warm. The corridor is narrow. That's the constraint.

### 2.2 Text Stack

Text emerges from the surface. It doesn't sit on it — it glows against it. The warmth in the text color is what makes this feel like light rather than paint.

| Token | Hex | Role |
|-------|-----|------|
| `text` | `#e8e0d6` | Primary text. Warm cream. Never pure white. |
| `text-secondary` | `#c4b8a8` | Secondary text. Descriptions, metadata. |
| `text-muted` | `#8b8578` | Tertiary text. Timestamps, hints, placeholders. |
| `text-faint` | `#554f46` | Ghost text. Disabled states, watermarks. |

**Rule: all text colors share a warm undertone (yellow-orange hue, low saturation).** The text stack is the same hue family shifted along the lightness axis. No text color is neutral gray.

### 2.3 Signal

One color carries current. One color means "alive." This is the amber.

| Token | Hex | Role |
|-------|-----|------|
| `signal` | `#d4a853` | Primary action color. Focus rings, active indicators, progress bars, streaming cursors. |
| `signal-foreground` | `#0d0b0f` | Text on signal background (uses void). |
| `signal-dim` | `#d4a85340` | Signal at 25% opacity. Background tints, subtle highlights. |
| `signal-glow` | `#d4a85326` | Signal at 15% opacity. Ambient glow, hover states. |

**Rule: signal color appears ONLY on active, interactive, or live elements.** It never decorates. It never brands. It indicates. If an element has the signal color, it means something is happening or can happen. A signal-colored element that does nothing is a lie.

### 2.4 Seam

Borders and dividers. The seam between surfaces. These have their own thermal register — shifted toward purple, distinct from both the surface stack and the signal.

| Token | Hex | Role |
|-------|-----|------|
| `seam` | `#2a2530` | Standard border. Panel edges, card outlines. |
| `seam-subtle` | `#201c26` | Subtle divider. Section separators within a surface. |
| `seam-focus` | var(`signal`) | Focus ring. Uses signal color directly. |

**Rule: seams are purple-shifted, not signal-shifted.** Amber borders fight with amber signals. Purple borders create separation without competing for the signal register.

### 2.5 Semantic

Colors that carry fixed meaning. These override the signal color for specific states.

| Token | Hex | Meaning |
|-------|-----|---------|
| `positive` | `#4ade80` | Connected, success, healthy |
| `warning` | `#f97316` | Caution, thermal, degraded |
| `negative` | `#e5484d` | Error, destructive, critical |

These are deliberately standard. Green/orange/red are universal. They shouldn't be themed — their meaning depends on being recognizable.

### 2.6 Chart Palette

For data visualization. Ordered by visual weight so chart-1 (the most important series) gets the signal color.

| Token | Hex | Name |
|-------|-----|------|
| `chart-1` | `#d4a853` | Amber (signal) |
| `chart-2` | `#b87333` | Copper |
| `chart-3` | `#c4956a` | Sandstone |
| `chart-4` | `#8b7355` | Umber |
| `chart-5` | `#6b5b45` | Walnut |

All chart colors share the warm-earth hue family. No blues, no greens, no purples in the default chart palette — those belong to semantic colors and would create confusion.

---

## 3. Typography

Two typefaces. Two registers. The typeface tells you what kind of information you're reading.

| Token | Family | Register |
|-------|--------|----------|
| `font-sans` | DM Sans | Human language. UI chrome, labels, descriptions, navigation, prose. |
| `font-mono` | JetBrains Mono | Machine language. Data values, metrics, tok/s, timestamps, code, IDs. |

**Rule: if the value is measured, computed, or machine-generated, it's mono. If it's written by a human for a human, it's sans.**

Optional display face for editorial/content contexts:

| Token | Family | Register |
|-------|--------|----------|
| `font-display` | Instrument Serif | Headings in content-heavy contexts. Markdown headings, article titles. Not for UI chrome. |

The display face is opt-in per project. The Knowledge app uses it. Flash-MoE doesn't — no editorial content, no need.

### Size scale for monospace data

| Name | Size | Use |
|------|------|-----|
| `mono` | 12px | Standard data readout |
| `mono-sm` | 10px | Dense metrics, secondary data |
| `mono-xs` | 9px | Labels, tags, badge text |

These are absolute, not relative. Monospace data values need consistent sizing for alignment. `monospacedDigit()` (SwiftUI) or `font-variant-numeric: tabular-nums` (CSS) is always applied.

---

## 4. Material Grain — The Noise Texture

The SVG `feTurbulence` overlay that makes flat CSS feel like a surface. This is the most important single detail in the entire system. Without it, the palette is "dark mode." With it, the palette is a *material*.

```css
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,...feTurbulence type='fractalNoise'
    baseFrequency='.85' numOctaves='4' stitchTiles='stitch'...");
  background-size: 128px;
}
```

### Parameters

| Parameter | Value | Range | Effect |
|-----------|-------|-------|--------|
| `type` | `fractalNoise` | — | Must be fractalNoise, not turbulence. Turbulence creates directional streaks. FractalNoise creates isotropic grain. |
| `baseFrequency` | 0.85 | 0.7–0.95 | Grain size. Lower = coarser (visible texture). Higher = finer (smoother). |
| `numOctaves` | 4 | 3–5 | Complexity. 3 = simple noise. 4 = natural grain. 5 = heavy but subtle. |
| `opacity` | 0.025 | **0.02–0.04** | The critical band. Below 0.02 = invisible. Above 0.04 = competing with content. |
| `background-size` | 128px | 128–256px | Tile size. Smaller = more repetition visible. Larger = less visible tiling but heavier memory. |

**Rule: the noise opacity lives in a narrow band and must be tested on the actual surface colors.** 0.025 is calibrated for the `#0d0b0f` void. Lighter surfaces may need lower opacity to maintain the same perceptual density.

---

## 5. Variant System

A variant is a *thermal shift* of the canonical palette. It's not "pick different colors" — it's "the same instrument tuned to a different key." Every variant must maintain internal thermal coherence: all surfaces, all text, all seams must share a consistent temperature.

### 5.1 Variant Parameters

A variant is defined by five parameters:

| Parameter | Type | Canonical (Amber) | Description |
|-----------|------|-------------------|-------------|
| `surface-hue` | degrees | 270 | The hue of the surface stack. The purple corridor. |
| `surface-temp` | warm / cool | warm | Shifts the surface saturation and lightness curve. |
| `signal-hue` | degrees | 40 | The hue of the signal color. |
| `signal-chroma` | 0–1 | 0.65 | How saturated the signal color is. |
| `text-warmth` | 0–1 | 0.7 | How warm the text stack is. 0 = silver. 1 = gold. |

### 5.2 Derivation Rules

Given the five parameters, all tokens are derived:

**Surface stack:** Start at `surface-hue`, lightness 4%. Step +3% lightness per level, -1% saturation per level. If `surface-temp` is cool, reduce saturation by half and shift hue toward 220 (blue).

**Text stack:** Start at lightness 90%, saturation 8%. Hue = lerp(0°, 35°, `text-warmth`). Step -16% lightness per level.

**Signal:** `hsl(signal-hue, signal-chroma * 100%, 58%)`. Foreground = void. Dim = signal at 25%. Glow = signal at 15%.

**Seam:** Surface-hue + 0°, lightness midpoint between surface and raised, saturation reduced by 30%. The seam lives between surfaces and doesn't compete with either.

**Chart palette:** Five colors radiating from signal-hue. Steps of -15° hue and -8% lightness. Creates a monochromatic gradient anchored at the signal.

### 5.3 Named Variants

These are the tunings I'd start with. Each has a physical metaphor — what material or environment the palette evokes.

#### Amber (canonical)
The precision instrument in a dark room. Warm near-black, amber signal, cream text.

```
surface-hue: 270    surface-temp: warm
signal-hue: 40      signal-chroma: 0.65
text-warmth: 0.7
```

| Role | Hex |
|------|-----|
| void | `#0d0b0f` |
| signal | `#d4a853` |
| text | `#e8e0d6` |
| seam | `#2a2530` |

#### Copper
Oxidized metal. Warmer than Amber, signal shifted toward red-orange. The patina palette. Like a copper bracelet after a month of wear.

```
surface-hue: 275    surface-temp: warm
signal-hue: 25      signal-chroma: 0.6
text-warmth: 0.75
```

| Role | Hex |
|------|-----|
| void | `#0f0b0d` |
| signal | `#c67a4b` |
| text | `#e8ddd2` |
| seam | `#2c2428` |

This is close to what the Knowledge app evolved toward independently. The `--color-accent: #c4a882` and `--color-veyra: #c67a4b` are in the Copper family.

#### Midnight
Cool instrument panel. Blue-shifted surfaces, cyan-white signal, silver text. The submarine control room. CRT terminal without the green.

```
surface-hue: 220    surface-temp: cool
signal-hue: 195     signal-chroma: 0.55
text-warmth: 0.2
```

| Role | Hex |
|------|-----|
| void | `#0a0d12` |
| signal | `#5ba8c4` |
| text | `#d6dce4` |
| seam | `#1e2430` |

#### Rose Gold
Warm but shifted toward pink. The signal is a soft metallic pink-gold. Expensive. The register is "luxury instrument" rather than "military hardware."

```
surface-hue: 280    surface-temp: warm
signal-hue: 15      signal-chroma: 0.45
text-warmth: 0.6
```

| Role | Hex |
|------|-----|
| void | `#0e0b10` |
| signal | `#c4887a` |
| text | `#e4ddd6` |
| seam | `#2a2432` |

#### Jade
Cool surfaces with a warm green signal. The plant in the server room. The combination of organic signal against inorganic surfaces creates tension — the alive thing in the machine.

```
surface-hue: 240    surface-temp: cool
signal-hue: 155     signal-chroma: 0.5
text-warmth: 0.35
```

| Role | Hex |
|------|-----|
| void | `#0b0c10` |
| signal | `#53b88a` |
| text | `#d8ddd8` |
| seam | `#222630` |

#### Bone
Warm surfaces pushed toward brown rather than purple. Very low signal chroma — the amber is barely saturated, almost gray-gold. The register is "aged paper, old instruments, museum lighting." Quietest variant.

```
surface-hue: 30     surface-temp: warm
signal-hue: 42      signal-chroma: 0.35
text-warmth: 0.8
```

| Role | Hex |
|------|-----|
| void | `#0f0d0b` |
| signal | `#a89878` |
| text | `#e8e0d0` |
| seam | `#2a2822` |

#### Ultraviolet
The purple corridor taken to its logical extreme. Surfaces lean into the purple instead of hiding it. Signal stays amber but surfaces glow faintly violet. The register is "neon in fog." Most dramatic variant.

```
surface-hue: 275    surface-temp: warm
signal-hue: 45      signal-chroma: 0.7
text-warmth: 0.55
```

| Role | Hex |
|------|-----|
| void | `#0e0a12` |
| signal | `#d4aa48` |
| text | `#e2dade` |
| seam | `#2e2436` |

---

## 6. Per-Project Signal Colors

Some projects need identity beyond the variant system. Agent dashboards, multi-tenant UIs, any context where "whose is this?" matters.

These are **accent overrides** — they replace the signal color for identity marking while keeping the rest of the thermal envelope intact.

| Token | Example Hex | Use |
|-------|-------------|-----|
| `agent-veyra` | `#c67a4b` | Veyra's identity color (copper-orange) |
| `agent-iris` | `#7c8fd4` | Iris's identity color (soft blue) |
| `agent-neve` | `#a87cd4` | My identity color (purple) |
| `agent-sumi` | `#d47ca8` | Sumi's identity color (rose) |

**Rule: agent colors appear ONLY for identity marking — avatars, attribution badges, thread indicators.** They don't replace the signal color for interactive elements. Signal stays signal. Agent colors are *who*, signal is *what's happening*.

The Knowledge app's `--color-veyra` and `--color-iris` tokens are already doing this correctly.

---

## 7. iOS / SwiftUI Mapping

The design tokens map to SwiftUI as an enum of static `Color` values (as in `Theme.swift`). The naming convention changes from CSS kebab-case to Swift camelCase, but the semantic structure is identical.

| CSS Token | Swift Property | Type |
|-----------|---------------|------|
| `--color-background` (void) | `FlashTheme.background` | `Color` |
| `--color-primary` (signal) | `FlashTheme.primary` | `Color` |
| `--color-foreground` (text) | `FlashTheme.foreground` | `Color` |
| `--color-border` (seam) | `FlashTheme.border` | `Color` |
| — | `FlashTheme.mono` | `Font` |
| — | `FlashTheme.monoSmall` | `Font` |

The iOS implementation should adopt the semantic names (`signal`, `void`, `seam`) rather than the shadcn names (`primary`, `background`, `border`). The shadcn names are inherited from the component library. The semantic names are ours.

---

## 8. Shared Components

### Noise Overlay

Should be a reusable component or mixin, not copy-pasted CSS.

**Web:** CSS class `.grain` applied to body or a layout wrapper. The noise parameters (opacity, frequency, tile size) are CSS variables that can be tuned per-variant.

```css
.grain::before {
  /* ... fixed positioning, pointer-events: none ... */
  opacity: var(--grain-opacity, 0.025);
  /* SVG with configurable baseFrequency via var(--grain-frequency, 0.85) */
}
```

**iOS:** A `GrainOverlay` view modifier that composites a noise texture above the content. Use `CIFilter` or a pre-rendered noise image at 2x.

### Scrollbar

The custom scrollbar styling is part of the material language. 6px width, transparent track, seam-colored thumb, muted-foreground on hover. Shared CSS class or included in the base layer.

### Animations

Three standard animations are shared across all projects:

| Name | Duration | Curve | Use |
|------|----------|-------|-----|
| `fade-up` | 400ms | cubic-bezier(0.22, 1, 0.36, 1) | Entry of cards, list items, page content |
| `fade-in` | 300ms | ease | Subtle entry of overlays, tooltips |
| `shimmer` | 1800ms | ease-in-out, infinite | Skeleton loading placeholders |

The `stagger` class (from Knowledge app) is a useful addition — incremental `animation-delay` on children for cascade entry effects.

---

## 9. Implementation Path

### Phase 1: Token Source of Truth

Create `packages/theme/` in the TanStack Start template (or as a standalone package) containing:

- `tokens.ts` — all color values as TypeScript constants with JSDoc descriptions
- `variants.ts` — the named variants as parameter objects + a `derive()` function that computes full token sets from parameters
- `globals.css` — the canonical CSS, importing token values
- `grain.css` — the noise overlay as a standalone class
- `swift/Theme.swift` — generated from the same token source

### Phase 2: Variant Generator

A `derive(params: VariantParams): TokenSet` function that takes the five parameters from 5.1 and produces a complete token set. This enables:

- Programmatic variant creation
- Runtime theme switching
- Per-project customization without manual hex picking
- Playground for exploring variants visually

### Phase 3: Playground

An interactive variant explorer. Five sliders (surface-hue, surface-temp, signal-hue, signal-chroma, text-warmth). Live preview of all surfaces, text levels, signal states, and a sample UI. Named variant presets as starting points. Export as CSS variables or Swift code.

---

## 10. Invariants

Rules that hold across ALL variants. These are the material's physics — change them and it stops being the same language.

1. **One signal color.** Never two. The signal is the only color that means "alive." A second signal color creates ambiguity about what's active.

2. **Signal = interaction.** If it has the signal color, it's interactive or live. No exceptions. No decorative signal.

3. **Text is never pure white or pure gray.** Always has warmth (or coolness in cool variants). Text emerges from the surface, doesn't sit on it.

4. **The noise overlay exists.** Flat CSS without grain is not this material language. It's just dark mode. The grain is non-negotiable.

5. **Monospace for measured values.** Metrics, timestamps, IDs, data readouts. Never sans-serif for numbers that matter. The typeface is information.

6. **Semantic colors are fixed.** Green/orange/red don't change between variants. They are universal and their meaning depends on consistency.

7. **The surface stack has at least 4 levels.** Void, surface, raised, elevated. Fewer levels and the interface becomes flat. More are fine but usually unnecessary.

8. **Borders are thermally distinct from both surfaces and signal.** They're the seam, not the surface and not the accent. They live in their own register.

---

## 11. What This Is Not

- Not a component library. This spec says nothing about button shapes, card padding, or layout patterns. It says what color and material they're made of.
- Not a brand guide. No logos, no marketing guidelines. The palette is an instrument surface, not an identity system.
- Not mandatory for every project. External-facing marketing pages, editorial content sites, or contexts that require light mode should use something else. This language is for **tools, dashboards, control surfaces, and instruments.**

The palette is for interfaces where someone is *operating* something. Monitoring. Controlling. Building. The register is operational, not editorial. The beauty is a side effect of the function, not the goal.

---

*The narrow band between "is this even doing anything" and "this is distracting" — that band is where materiality lives.*
