// Color-theory scheme engine — pure math, no React, no DOM.
//
// Turns a seed color (or a set of labels) into `n` harmonious, legible,
// semantically-safe accent colors. Two regimes share one set of guards:
//
//   - HARMONY (small n, aesthetic): hue rotation off the seed (§3 of the spec),
//     for accents / duotone / small chart sets where "related and pretty" wins.
//   - CATEGORICAL (arbitrary n, "no collision"): greedy farthest-point spread in
//     a PERCEPTUAL space (OKLab), so every color is tellable apart — for
//     many-series data / entity palettes.
//
// Both fit every color for WCAG legibility on the surrounding surface(s) and
// keep it out of the reserved status-hue bands (red/green/amber/blue) so a
// generated color never reads as system state.
//
// dedupe: this module carries its own WCAG contrast core (`relativeLuminance`,
// `contrastRatio`, `wcagRating`) mirroring apps/web's `theme-derive.ts`. The
// engine lives in packages/ui, which cannot import from apps/web — so the math
// is duplicated on purpose. The correct future dedupe direction is the reverse:
// theme-derive.ts (in apps/web) could import these from @workspace/ui once
// someone wants to collapse them. Do NOT refactor theme-derive to do that now.
//
// Color-science decisions (documented for the reviewer):
//   - ΔE = OKLab EUCLIDEAN distance. OKLab (Björn Ottosson, 2020) is engineered
//     so plain Euclidean distance approximates perceptual difference; it is
//     simpler and better-behaved than CIEDE2000 and the spec explicitly permits
//     it. `perceptualDistance` returns sqrt(ΔL² + Δa² + Δb²) in OKLab units.
//   - Categorical spread = greedy FARTHEST-POINT sampling (max-min diversity):
//     from a legibility-fit, reserved-filtered candidate pool, repeatedly add
//     the candidate that maximizes the minimum ΔE to the already-chosen set.
//   - Legibility thresholds: single-surface accents-as-text target 4.5:1 (WCAG
//     AA text). Categorical SERIES are graphical objects (WCAG 1.4.11) and
//     target 3:1 against EVERY provided surface. A single hue clearing 4.5:1 on
//     both a near-white and a near-black surface is a razor-thin luminance band
//     (essentially empty), so dual-surface uses the graphical-object 3:1 AA and
//     draws distinctness from hue/chroma, not lightness.

// ─── Types ──────────────────────────────────────────────────────────────────

export type Strategy =
  | "auto"
  | "complementary"
  | "analogous"
  | "triadic"
  | "split-complementary"
  | "tetradic"

/** Named harmony strategies (everything except the "auto" sentinel). */
export type NamedStrategy = Exclude<Strategy, "auto">

/** Optional bias axis: calm favors tighter/analogous, energetic favors wider spread. */
export type Mood = "calm" | "neutral" | "energetic"

/** A reserved status hue and how wide a band around it to protect (degrees). */
export interface ReservedHue {
  hue: number
  tol: number
}

export interface SchemeConfig {
  /** Seed color (`#rrggbb`). Drives harmony rotation + the categorical anchor. */
  seed?: string
  /** Label set — presence switches to the categorical regime, stable per label. */
  labels?: string[]
  /** Harmony strategy; "auto" (default) picks one from n + mood. */
  strategy?: Strategy
  /** Color count. Defaults to labels.length, else 3. */
  n?: number
  /** Bias axis. Default "neutral". */
  mood?: Mood
  /**
   * Force a regime. Default (omitted): picked by intent — a label set or n > 4
   * → categorical, else harmony. The Studio's harmony/categorical toggle uses
   * this to override the automatic choice.
   */
  regime?: "harmony" | "categorical"
}

export interface Scheme {
  /** The generated colors, in order (`#rrggbb`). */
  colors: string[]
  /** Stable label→color accessor. Order-independent, identical across calls. */
  colorFor: (label: string) => string
  /** Stable label→slot accessor (index into `colors`). */
  indexFor: (label: string) => number
  /** Which regime produced these colors. */
  regime: "harmony" | "categorical"
  /** The resolved harmony strategy (categorical regime reports "auto"). */
  strategy: Strategy
}

export interface Oklab {
  L: number
  a: number
  b: number
}

// ─── Hex / RGB / HSL core ─────────────────────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360
}

/** Parse `#rgb` / `#rrggbb` (with or without `#`) to [r,g,b] in 0–255. Malformed → black. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "")
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 0, 0]
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** [r,g,b] in 0–255 → `#rrggbb`. */
export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")
  return `#${to(r)}${to(g)}${to(b)}`
}

/** HSL (h in deg, s/l in 0–1) → `#rrggbb`. Mirrors theme-derive's hslToHex. */
export function hslToHex(h: number, s: number, l: number): string {
  h = wrapHue(h)
  s = clamp01(s)
  l = clamp01(l)
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** `#rrggbb` → HSL { h (deg), s, l }. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r255, g255, b255] = hexToRgb(hex)
  const r = r255 / 255
  const g = g255 / 255
  const b = b255 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = wrapHue(h * 60)
  }
  return { h, s, l }
}

// ─── WCAG contrast (mirrors theme-derive.ts — see the dedupe note) ─────────────

/** WCAG relative luminance of a `#rrggbb` hex color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  const channel = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two `#rrggbb` hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** WCAG rating for a normal-text pairing. */
export function wcagRating(ratio: number): "AAA" | "AA" | "fail" {
  if (ratio >= 7) return "AAA"
  if (ratio >= 4.5) return "AA"
  return "fail"
}

// ─── OKLab + perceptual distance ───────────────────────────────────────────────
// Björn Ottosson's OKLab. sRGB → linear → LMS → OKLab. Euclidean distance in
// OKLab approximates perceptual difference (the whole reason to use it).

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return c * 255
}

/** `#rrggbb` → OKLab. */
export function hexToOklab(hex: string): Oklab {
  const [r8, g8, b8] = hexToRgb(hex)
  const r = srgbToLinear(r8)
  const g = srgbToLinear(g8)
  const b = srgbToLinear(b8)

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

/** OKLab → `#rrggbb` (clamped to sRGB gamut by channel clamp). */
export function oklabToHex({ L, a, b }: Oklab): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const b2 = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  return rgbToHex(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b2))
}

/**
 * Perceptual distance (ΔE) between two hex colors: Euclidean distance in OKLab.
 * Identical colors → 0. Larger = more perceptibly different. Typical units:
 * near-neighbor hues at similar lightness sit around ~0.05–0.1; opposite hues
 * exceed ~0.2.
 */
export function perceptualDistance(a: string, b: string): number {
  const la = hexToOklab(a)
  const lb = hexToOklab(b)
  const dL = la.L - lb.L
  const da = la.a - lb.a
  const db = la.b - lb.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

// ─── Harmony ───────────────────────────────────────────────────────────────────

const HARMONY_OFFSETS: Record<NamedStrategy, number[]> = {
  // Ordered so the first n entries give the intended small-n palette.
  complementary: [0, 180, 90, 270],
  analogous: [0, 30, -30, 60, -60],
  triadic: [0, 120, 240, 60],
  "split-complementary": [0, 150, 210, 30],
  tetradic: [0, 90, 180, 270],
}

/**
 * `n` hues rotated off the seed hue per the named strategy (§3). Deterministic.
 * "auto" resolves via `selectStrategy`. Returned hues are wrapped to [0,360).
 */
export function harmony(hue: number, strategy: NamedStrategy, n: number): number[] {
  const offsets = HARMONY_OFFSETS[strategy]
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    // Beyond the table's length, keep rotating by the base step so large n still
    // produces distinct (if degraded) hues rather than repeating.
    const off = i < offsets.length ? offsets[i] : (offsets[1] ?? 180) * (i - offsets.length + 2)
    out.push(wrapHue(hue + off))
  }
  return out
}

/**
 * Auto strategy heuristic (§3): choose by n, biased by mood. Calm favors
 * tighter (analogous / split), energetic favors wider separation (triadic /
 * tetradic). Deterministic.
 */
export function selectStrategy(seed: string, n: number, mood: Mood = "neutral"): NamedStrategy {
  void seed // reserved for future seed-aware tuning; kept in the signature per spec §8
  if (n <= 2) return mood === "calm" ? "analogous" : "complementary"
  if (n === 3) {
    if (mood === "calm") return "split-complementary"
    if (mood === "energetic") return "triadic"
    return "triadic"
  }
  // n >= 4
  if (mood === "calm") return "analogous"
  return "tetradic"
}

// ─── Reserved status-hue guard ─────────────────────────────────────────────────

/**
 * Default reserved bands, derived from this template's status tokens:
 * destructive #e5484d, success #4cb782, warning #e09143, info #5b9dc4.
 * Callers may pass their own (e.g. from resolved theme tokens).
 */
export const DEFAULT_STATUS_HUES: ReservedHue[] = [
  { hue: hexToHsl("#e5484d").h, tol: 14 }, // destructive / red
  { hue: hexToHsl("#4cb782").h, tol: 14 }, // success / green
  { hue: hexToHsl("#e09143").h, tol: 14 }, // warning / amber
  { hue: hexToHsl("#5b9dc4").h, tol: 14 }, // info / blue
]

/** Signed shortest angular delta from `a` to `b`, in (-180, 180]. */
function hueDelta(a: number, b: number): number {
  let d = wrapHue(b) - wrapHue(a)
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/** Is `hue` inside any reserved band? */
export function inReservedBand(hue: number, reserved: ReservedHue[]): boolean {
  return reserved.some((r) => Math.abs(hueDelta(r.hue, hue)) <= r.tol)
}

/**
 * Nudge each hue out of any reserved status band (§5). A hue landing inside a
 * band is pushed to the nearer band edge (+ a 1° margin) so it no longer reads
 * as system state. Deterministic; order-preserving.
 */
export function reserveSemanticHues(hues: number[], reserved: ReservedHue[]): number[] {
  return hues.map((h0) => {
    let h = wrapHue(h0)
    // Resolve against every band; a nudge out of one could land in another, so
    // iterate to a fixed point (bounded — bands are narrow and few).
    for (let guard = 0; guard < 8; guard++) {
      const hit = reserved.find((r) => Math.abs(hueDelta(r.hue, h)) <= r.tol)
      if (!hit) break
      const delta = hueDelta(hit.hue, h) // where h sits relative to the band center
      // Push to the nearer edge. If dead-center, break ties toward +.
      const dir = delta >= 0 ? 1 : -1
      h = wrapHue(hit.hue + dir * (hit.tol + 1))
    }
    return h
  })
}

// ─── Legibility fit ─────────────────────────────────────────────────────────────

/**
 * Fit a hue's LIGHTNESS so the resulting color clears `target` contrast against
 * a single surface (hue + saturation held; §4). Searches the full lightness
 * range and picks the clearing value nearest a vivid mid-lightness (so the
 * accent stays saturated, not muddied). If nothing clears, returns the
 * best-effort maximum-contrast color. Generalizes theme-derive's
 * `darkenToContrast` to also lighten (needed for dark surfaces).
 */
export function fitAccent(
  hue: number,
  sat: number,
  surface: string,
  target = 4.5,
  preferL = 0.55,
): string {
  let best: string | null = null
  let bestScore = Infinity
  let fallback = "#000000"
  let fallbackContrast = 0
  for (let l = 0.14; l <= 0.94; l += 0.02) {
    const c = hslToHex(hue, sat, l)
    const cr = contrastRatio(c, surface)
    if (cr > fallbackContrast) {
      fallbackContrast = cr
      fallback = c
    }
    if (cr >= target) {
      const score = Math.abs(l - preferL)
      if (score < bestScore) {
        bestScore = score
        best = c
      }
    }
  }
  return best ?? fallback
}

/**
 * Fit a hue's lightness so the color clears `target` against EVERY surface (the
 * dual-surface categorical case). Among lightnesses that clear all surfaces,
 * picks the median (most robust to surface drift); if none clear, returns the
 * color maximizing the minimum contrast across surfaces (best-effort).
 */
export function fitToSurfaces(
  hue: number,
  sat: number,
  surfaces: string[],
  target = 3,
): string {
  const clearing: string[] = []
  let fallback = "#000000"
  let fallbackMin = 0
  for (let l = 0.12; l <= 0.94; l += 0.01) {
    const c = hslToHex(hue, sat, l)
    let minCr = Infinity
    for (const s of surfaces) minCr = Math.min(minCr, contrastRatio(c, s))
    if (minCr > fallbackMin) {
      fallbackMin = minCr
      fallback = c
    }
    if (minCr >= target) clearing.push(c)
  }
  if (clearing.length === 0) return fallback
  return clearing[Math.floor(clearing.length / 2)]
}

// ─── Stable label → slot hash ──────────────────────────────────────────────────

/**
 * Deterministic FNV-1a hash of a label → a stable slot in [0, n). The SAME
 * label maps to the SAME slot for a given n across calls, reloads, and machines
 * (§5). Independent of any other labels or ordering.
 */
export function stableIndex(label: string, n: number): number {
  if (n <= 0) return 0
  let hash = 0x811c9dc5
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i)
    // FNV prime 16777619, via Math.imul to stay in 32-bit.
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % n
}

// ─── Categorical spread (greedy farthest-point) ─────────────────────────────────

function saturationForMood(mood: Mood): number {
  switch (mood) {
    case "calm":
      return 0.52
    case "energetic":
      return 0.78
    default:
      return 0.65
  }
}

/**
 * `n` maximally-distinct colors (§5b): greedy farthest-point spread in OKLab
 * over a candidate pool that is already legibility-fit to every surface and
 * clear of the reserved bands. Deterministic — the pool is a fixed hue grid and
 * the seed candidate is chosen by proximity to `seedHue` (or a fixed anchor).
 *
 * `surfaces` are the surfaces every color must stay legible on (target 3:1,
 * graphical-object AA — see the module header on why dual-surface uses 3:1).
 */
export function distinctColors(
  n: number,
  surfaces: string[],
  reserved: ReservedHue[] = DEFAULT_STATUS_HUES,
  mood: Mood = "neutral",
  seedHue = 25,
  target = 3,
): string[] {
  if (n <= 0) return []
  const sat = saturationForMood(mood)

  // Candidate pool: a fine hue grid, minus the reserved bands, each fit legible.
  const candidates: { hue: number; hex: string; lab: Oklab }[] = []
  for (let hue = 0; hue < 360; hue += 3) {
    if (inReservedBand(hue, reserved)) continue
    const hex = fitToSurfaces(hue, sat, surfaces, target)
    candidates.push({ hue, hex, lab: hexToOklab(hex) })
  }
  if (candidates.length === 0) return []

  const distLab = (x: Oklab, y: Oklab) => {
    const dL = x.L - y.L
    const da = x.a - y.a
    const db = x.b - y.b
    return Math.sqrt(dL * dL + da * da + db * db)
  }

  // Seed: candidate nearest the requested seed hue (deterministic anchor).
  let startIdx = 0
  let startBest = Infinity
  for (let i = 0; i < candidates.length; i++) {
    const d = Math.abs(hueDelta(seedHue, candidates[i].hue))
    if (d < startBest) {
      startBest = d
      startIdx = i
    }
  }

  const chosen: typeof candidates = [candidates[startIdx]]
  const remaining = candidates.filter((_, i) => i !== startIdx)

  while (chosen.length < n && remaining.length > 0) {
    // Pick the remaining candidate maximizing its minimum distance to `chosen`.
    let bestI = 0
    let bestMin = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      let minD = Infinity
      for (const c of chosen) minD = Math.min(minD, distLab(remaining[i].lab, c.lab))
      // Tie-break deterministically by lower hue (stable ordering).
      if (minD > bestMin + 1e-9 || (Math.abs(minD - bestMin) <= 1e-9 && remaining[i].hue < remaining[bestI].hue)) {
        bestMin = minD
        bestI = i
      }
    }
    chosen.push(remaining[bestI])
    remaining.splice(bestI, 1)
  }

  return chosen.map((c) => c.hex)
}

// ─── Composed pipeline ──────────────────────────────────────────────────────────

/**
 * The composed generator (§8). Picks the regime by intent:
 *   - a label set OR n > 4 → CATEGORICAL (max-min perceptual spread)
 *   - otherwise → HARMONY (hue rotation off the seed)
 *
 * `surfaces` are the surrounding surfaces for legibility fit. Pass one (the
 * active mode's background) for accents, or two (light + dark) for a palette
 * that must survive both. `statusHues` are the reserved bands.
 *
 * Deterministic for a given (config, surfaces, statusHues). `colorFor(label)`
 * is stable and order-independent.
 */
export function generateScheme(
  config: SchemeConfig,
  surfaces: string[],
  statusHues: ReservedHue[] = DEFAULT_STATUS_HUES,
): Scheme {
  const { seed, labels, mood = "neutral" } = config
  const n = config.n ?? labels?.length ?? 3
  const strategy = config.strategy ?? "auto"

  const categorical = config.regime
    ? config.regime === "categorical"
    : (labels != null && labels.length > 0) || n > 4

  let colors: string[]
  let regime: "harmony" | "categorical"
  let resolvedStrategy: Strategy

  if (categorical) {
    const seedHue = seed ? hexToHsl(seed).h : 25
    colors = distinctColors(n, surfaces, statusHues, mood, seedHue)
    regime = "categorical"
    resolvedStrategy = "auto"
  } else {
    const seedHue = seed ? hexToHsl(seed).h : 40
    const named = strategy === "auto" ? selectStrategy(seed ?? "#d4a853", n, mood) : strategy
    const rawHues = harmony(seedHue, named, n)
    const safeHues = reserveSemanticHues(rawHues, statusHues)
    const sat = saturationForMood(mood)
    // Accents are shown as fill/text on a surface — fit each to clear AA text
    // (4.5) against the first (primary) surface; if two surfaces are given, fall
    // back to the dual-surface graphical fit so it survives both modes.
    colors = safeHues.map((h) =>
      surfaces.length > 1 ? fitToSurfaces(h, sat, surfaces, 3) : fitAccent(h, sat, surfaces[0], 4.5),
    )
    regime = "harmony"
    resolvedStrategy = named
  }

  const colorFor = (label: string) => colors[stableIndex(label, colors.length)] ?? colors[0]
  const indexFor = (label: string) => stableIndex(label, colors.length)

  return { colors, colorFor, indexFor, regime, strategy: resolvedStrategy }
}
