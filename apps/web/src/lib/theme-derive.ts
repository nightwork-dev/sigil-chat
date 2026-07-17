/**
 * Theme derivation engine.
 *
 * Takes a handful of parameters and derives a complete set of CSS custom
 * properties for BOTH appearance modes. This is the math behind the variant
 * system — the same logic that produced the hand-tuned values in themes.css,
 * but as a runtime function.
 *
 * `derive(params, mode)`:
 *   - "dark"  — the canonical dark envelope (near-black surfaces, light ink,
 *     signal at mid lightness). Surface saturation is high enough that
 *     SURFACE HUE is visibly perceptible even at near-black lightness (fixed
 *     2026-07-09 — it used to be a near no-op).
 *   - "light" — the surface-stack inversion: paper surfaces carrying a faint
 *     wash of the envelope's SURFACE hue (not the signal hue — fixed
 *     2026-07-09, same no-op bug), dark ink, and a signal DARKENED until it
 *     clears WCAG AA as text/fill on paper.
 *
 * The module is isomorphic and pure (no DOM, no Node) EXCEPT for
 * `applyDerivedTokens`/`clearDerivedTokens`, which touch `document`. The pure
 * core is imported by the dev-only source writer server function.
 */

export type Mode = "dark" | "light"

export interface VariantParams {
  /** Hue of the surface stack (degrees). Canonical: 270 (purple corridor). */
  surfaceHue: number
  /** Surface temperature. 0 = cool, 1 = warm. Canonical: 0.8. */
  surfaceTemp: number
  /** Hue of the signal/primary color (degrees). Canonical: 40 (amber). */
  signalHue: number
  /** Saturation of the signal color. 0–1. Canonical: 0.65. */
  signalChroma: number
  /** Warmth of the text stack. 0 = silver, 1 = gold. Canonical: 0.7. */
  textWarmth: number
  /** Base corner radius in px (maps to --radius-md; sm/lg/xl scale off it). Canonical: 8. */
  radius: number
  /** Hue of the destructive/error signal (degrees). Canonical: 358 (red). */
  destructiveHue: number
}

export interface DerivedTokens {
  background: string
  foreground: string
  card: string
  cardForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  destructive: string
  destructiveForeground: string
  success: string
  successForeground: string
  warning: string
  warningForeground: string
  info: string
  infoForeground: string
  border: string
  sidebar: string
  sidebarPrimary: string
  chart1: string
  chart2: string
  chart3: string
  chart4: string
  chart5: string
  /** Corner radii, px. Derived from `params.radius`. */
  radiusSm: number
  radiusMd: number
  radiusLg: number
  radiusXl: number
  grainOpacity: number
}

// ─── Color utilities ────────────────────────────────────────────────────────

function hsl(h: number, s: number, l: number): string {
  return hslToHex(h, s, l)
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }

  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

// ─── WCAG contrast (pure; used by the live contrast readout + AA safety) ──────

/** WCAG relative luminance of a `#rrggbb` hex color. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "")
  const channel = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
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

/**
 * Darken a color (hue+sat fixed) from `startL` downward until it clears the AA
 * text/fill threshold (4.5:1) against `bg`, so a light-mode signal is provably
 * legible on paper. Floors at l=0.12 to avoid muddy near-black.
 */
function darkenToContrast(h: number, s: number, bg: string, startL: number, target = 4.5): string {
  let l = startL
  for (let i = 0; i < 48; i++) {
    const c = hslToHex(h, s, l)
    if (contrastRatio(c, bg) >= target) return c
    l -= 0.012
    if (l < 0.12) return hslToHex(h, s, 0.12)
  }
  return hslToHex(h, s, Math.max(0.12, l))
}

// ─── Radius (shared across modes — appearance doesn't change geometry) ────────

function radiusStack(radius: number) {
  const md = Math.max(0, radius)
  return {
    radiusSm: Math.round(md * 0.75),
    radiusMd: Math.round(md),
    radiusLg: Math.round(md * 1.5),
    radiusXl: Math.round(md * 2),
  }
}

// ─── Dark derivation ───────────────────────────────────────────────────────────
// NOTE (fix, 2026-07-09): the original baseSat/L combo (sat 0.04–0.12 at
// L=0.04–0.095) made Surface Hue a near no-op — at that little saturation and
// that little lightness the hue rotation was below what a screen/eye can
// resolve. Saturation is bumped substantially (and each rung's L nudged up a
// hair) so the hue is visibly perceptible while the ladder still reads as
// near-black (all rungs stay under L=0.12). This changes the frozen dark
// preset hex values — see theme-derive.test.ts.

function deriveDark(params: VariantParams): DerivedTokens {
  const { surfaceHue, surfaceTemp, signalHue, signalChroma, textWarmth, destructiveHue } = params

  // Surface saturation based on temperature — high enough that a surfaceHue
  // rotation is visibly perceptible even at near-black lightness.
  const baseSat = lerp(0.30, 0.70, surfaceTemp)

  // Surface stack: void → ground → surface → raised → elevated
  const void_ = hsl(surfaceHue, baseSat, 0.06)
  const ground = hsl(surfaceHue, baseSat * 0.85, 0.07)
  const surface = hsl(surfaceHue, baseSat * 0.75, 0.085)
  const raised = hsl(surfaceHue, baseSat * 0.7, 0.105)
  const elevated = hsl(surfaceHue, baseSat * 0.65, 0.115)

  // Text stack: warm cream to cool silver based on textWarmth
  const textHue = lerp(220, 35, textWarmth)
  const textSat = lerp(0.04, 0.12, textWarmth)
  const text = hsl(textHue, textSat, 0.90)
  const textMuted = hsl(textHue, textSat * 0.6, 0.52)

  // Signal (primary)
  const signal = hsl(signalHue, signalChroma, 0.58)

  // Seam (border) — surface hue, desaturated, midpoint lightness
  const seam = hsl(surfaceHue, baseSat * 0.5, 0.13)

  // Chart palette — 5 colors radiating from signal hue
  const chart1 = signal
  const chart2 = hsl(signalHue - 12, signalChroma * 0.8, 0.48)
  const chart3 = hsl(signalHue + 8, signalChroma * 0.7, 0.65)
  const chart4 = hsl(signalHue - 20, signalChroma * 0.6, 0.40)
  const chart5 = hsl(signalHue - 28, signalChroma * 0.5, 0.32)

  // Grain opacity — lighter backgrounds need less noise
  const bgLightness = 0.04
  const grainOpacity = lerp(0.020, 0.030, surfaceTemp) * (bgLightness < 0.05 ? 1 : 0.85)

  // Status — recognizable hues, mid lightness on near-black. Destructive is
  // parameterized; success/warning/info are stable recognizable signals.
  const destructive = hsl(destructiveHue, 0.72, 0.59)

  return {
    background: void_,
    foreground: text,
    card: surface,
    cardForeground: text,
    primary: signal,
    primaryForeground: void_,
    secondary: elevated,
    secondaryForeground: text,
    muted: raised,
    mutedForeground: textMuted,
    destructive,
    destructiveForeground: text,
    success: "#4cb782",
    successForeground: void_,
    warning: "#e09143",
    warningForeground: void_,
    info: "#5b9dc4",
    infoForeground: void_,
    border: seam,
    sidebar: ground,
    sidebarPrimary: signal,
    chart1,
    chart2,
    chart3,
    chart4,
    chart5,
    ...radiusStack(params.radius),
    grainOpacity,
  }
}

// ─── Light derivation (surface-stack inversion, AA-safe signal) ───────────────
// FIX (2026-07-09): the surface stack (paper/card/chip/border/ink) now keys off
// SURFACE HUE — the same param that drives the dark surface ladder — not
// signalHue. Previously the light path tinted paper off signalHue, so the
// Surface Hue slider was a total no-op in light mode (only Signal Hue moved
// anything). The signal itself still keys off signalHue, unchanged.

function deriveLight(params: VariantParams): DerivedTokens {
  const { surfaceHue, surfaceTemp, signalHue, signalChroma, destructiveHue } = params

  // Paper tint = the SURFACE hue at low saturation. Surfaces invert the dark
  // ladder: paper (bg) mid, cards a step LIGHTER (near-white), chips a step
  // DARKER (filled), border darkest.
  const ph = surfaceHue
  const sBase = lerp(0.14, 0.42, surfaceTemp)

  const paper = hsl(ph, sBase, 0.90)
  const raised = hsl(ph, sBase * 1.4, 0.955) // card / popover — near-white
  const chip = hsl(ph, sBase * 0.88, 0.855) // secondary / accent — filled
  const between = hsl(ph, sBase * 0.95, 0.878) // muted
  const ground = hsl(ph, sBase * 0.95, 0.888) // sidebar
  const seam = hsl(ph, sBase * 0.78, 0.79) // border / input

  // Ink flips light-on-dark → dark-on-light, tinted to the surface hue.
  const ink = hsl(ph, 0.20, 0.11)
  const inkMuted = hsl(ph, 0.14, 0.39)

  // Signal darkens/saturates until it clears AA as fill/text on paper.
  const sigSat = Math.min(1, signalChroma * 1.15 + 0.08)
  const signal = darkenToContrast(signalHue, sigSat, paper, 0.30)

  // Charts — a legible-on-light ramp radiating from the signal hue.
  const chart1 = signal
  const chart2 = darkenToContrast(signalHue - 12, signalChroma * 0.85, paper, 0.43)
  const chart3 = darkenToContrast(signalHue + 6, signalChroma * 0.65, paper, 0.33)
  const chart4 = darkenToContrast(signalHue + 2, signalChroma * 0.62, paper, 0.50)
  const chart5 = darkenToContrast(signalHue - 6, signalChroma * 0.45, paper, 0.26)

  // Status re-tuned for paper (deeper, still recognizable).
  const destructive = darkenToContrast(destructiveHue, 0.62, paper, 0.46)

  // Dark grains read louder on light — drop slightly.
  const grainOpacity = lerp(0.018, 0.022, surfaceTemp)

  return {
    background: paper,
    foreground: ink,
    card: raised,
    cardForeground: ink,
    primary: signal,
    primaryForeground: raised,
    secondary: chip,
    secondaryForeground: ink,
    muted: between,
    mutedForeground: inkMuted,
    destructive,
    destructiveForeground: raised,
    success: "#2e8a5c",
    successForeground: raised,
    warning: "#9a6410",
    warningForeground: raised,
    info: "#2f6f97",
    infoForeground: raised,
    border: seam,
    sidebar: ground,
    sidebarPrimary: signal,
    chart1,
    chart2,
    chart3,
    chart4,
    chart5,
    ...radiusStack(params.radius),
    grainOpacity,
  }
}

export function derive(params: VariantParams, mode: Mode = "dark"): DerivedTokens {
  return mode === "light" ? deriveLight(params) : deriveDark(params)
}

// ─── DOM application (the only side-effecting part) ───────────────────────────

/**
 * Apply derived tokens to the document as inline CSS custom properties for a
 * live preview. Because the preview must be correct in BOTH app modes, the
 * caller also toggles the matching `.light`/`.dark` marker class on <html> so
 * `dark:`/light Tailwind variants resolve to the authored mode.
 */
export function applyDerivedTokens(tokens: DerivedTokens): void {
  const root = document.documentElement
  const set = (k: string, v: string) => root.style.setProperty(k, v)
  set("--color-background", tokens.background)
  set("--color-foreground", tokens.foreground)
  set("--color-card", tokens.card)
  set("--color-card-foreground", tokens.cardForeground)
  set("--color-popover", tokens.card)
  set("--color-popover-foreground", tokens.cardForeground)
  set("--color-primary", tokens.primary)
  set("--color-primary-foreground", tokens.primaryForeground)
  set("--color-secondary", tokens.secondary)
  set("--color-secondary-foreground", tokens.secondaryForeground)
  set("--color-muted", tokens.muted)
  set("--color-muted-foreground", tokens.mutedForeground)
  set("--color-accent", tokens.secondary)
  set("--color-accent-foreground", tokens.secondaryForeground)
  set("--color-destructive", tokens.destructive)
  set("--color-destructive-foreground", tokens.destructiveForeground)
  set("--color-success", tokens.success)
  set("--color-success-foreground", tokens.successForeground)
  set("--color-warning", tokens.warning)
  set("--color-warning-foreground", tokens.warningForeground)
  set("--color-info", tokens.info)
  set("--color-info-foreground", tokens.infoForeground)
  set("--color-border", tokens.border)
  set("--color-input", tokens.border)
  set("--color-ring", tokens.primary)
  set("--color-sidebar", tokens.sidebar)
  set("--color-sidebar-foreground", tokens.foreground)
  set("--color-sidebar-primary", tokens.sidebarPrimary)
  set("--color-sidebar-primary-foreground", tokens.primaryForeground)
  set("--color-sidebar-border", tokens.border)
  set("--color-sidebar-accent", tokens.secondary)
  set("--color-sidebar-accent-foreground", tokens.secondaryForeground)
  set("--color-sidebar-ring", tokens.primary)
  set("--color-chart-1", tokens.chart1)
  set("--color-chart-2", tokens.chart2)
  set("--color-chart-3", tokens.chart3)
  set("--color-chart-4", tokens.chart4)
  set("--color-chart-5", tokens.chart5)
  set("--radius-sm", `${tokens.radiusSm}px`)
  set("--radius-md", `${tokens.radiusMd}px`)
  set("--radius-lg", `${tokens.radiusLg}px`)
  set("--radius-xl", `${tokens.radiusXl}px`)
  set("--grain-opacity", String(tokens.grainOpacity))
}

const OVERRIDE_PROPS = [
  "--color-background", "--color-foreground", "--color-card", "--color-card-foreground",
  "--color-popover", "--color-popover-foreground", "--color-primary", "--color-primary-foreground",
  "--color-secondary", "--color-secondary-foreground", "--color-muted", "--color-muted-foreground",
  "--color-accent", "--color-accent-foreground", "--color-destructive", "--color-destructive-foreground",
  "--color-success", "--color-success-foreground", "--color-warning", "--color-warning-foreground",
  "--color-info", "--color-info-foreground", "--color-border", "--color-input", "--color-ring",
  "--color-sidebar", "--color-sidebar-foreground", "--color-sidebar-primary",
  "--color-sidebar-primary-foreground", "--color-sidebar-border", "--color-sidebar-accent",
  "--color-sidebar-accent-foreground", "--color-sidebar-ring",
  "--color-chart-1", "--color-chart-2", "--color-chart-3", "--color-chart-4", "--color-chart-5",
  "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl",
  "--grain-opacity",
]

/** Clear all inline style overrides (return to CSS class control). */
export function clearDerivedTokens(): void {
  const root = document.documentElement
  OVERRIDE_PROPS.forEach((p) => root.style.removeProperty(p))
}

// ─── CSS block generation (copy/paste + dev source writer) ────────────────────

/**
 * Emit one theme block. Dark mode emits the full `.theme-<name>` block
 * (including display/CRT phosphor tokens derived from the signal hue). Light
 * mode emits `.theme-<name>.light`, overriding only the surface stack + signal
 * contrast — display tokens intentionally inherit the dark block (a lit
 * instrument screen stays dark in any room), matching the hand-tuned recipe.
 */
export function exportBlock(name: string, tokens: DerivedTokens, mode: Mode, signalHue?: number): string {
  const selector = mode === "light" ? `.theme-${name}.light` : `.theme-${name}`
  const lines: string[] = [`${selector} {`]
  const push = (k: string, v: string | number) => lines.push(`  ${k}: ${v};`)

  push("--color-background", tokens.background)
  push("--color-foreground", tokens.foreground)
  push("--color-card", tokens.card)
  push("--color-card-foreground", tokens.cardForeground)
  push("--color-popover", tokens.card)
  push("--color-popover-foreground", tokens.cardForeground)
  push("--color-primary", tokens.primary)
  push("--color-primary-foreground", tokens.primaryForeground)
  push("--color-secondary", tokens.secondary)
  push("--color-secondary-foreground", tokens.secondaryForeground)
  push("--color-muted", tokens.muted)
  push("--color-muted-foreground", tokens.mutedForeground)
  push("--color-accent", tokens.secondary)
  push("--color-accent-foreground", tokens.secondaryForeground)
  push("--color-destructive", tokens.destructive)
  push("--color-destructive-foreground", tokens.destructiveForeground)
  push("--color-success", tokens.success)
  push("--color-success-foreground", tokens.successForeground)
  push("--color-warning", tokens.warning)
  push("--color-warning-foreground", tokens.warningForeground)
  push("--color-info", tokens.info)
  push("--color-info-foreground", tokens.infoForeground)
  push("--color-border", tokens.border)
  push("--color-input", tokens.border)
  push("--color-ring", tokens.primary)
  push("--color-sidebar", tokens.sidebar)
  push("--color-sidebar-foreground", tokens.foreground)
  push("--color-sidebar-primary", tokens.sidebarPrimary)
  push("--color-sidebar-primary-foreground", tokens.primaryForeground)
  push("--color-sidebar-border", tokens.border)
  push("--color-sidebar-accent", tokens.secondary)
  push("--color-sidebar-accent-foreground", tokens.secondaryForeground)
  push("--color-sidebar-ring", tokens.primary)
  push("--color-chart-1", tokens.chart1)
  push("--color-chart-2", tokens.chart2)
  push("--color-chart-3", tokens.chart3)
  push("--color-chart-4", tokens.chart4)
  push("--color-chart-5", tokens.chart5)
  push("--color-chart-err", tokens.destructive)
  push("--radius-sm", `${tokens.radiusSm}px`)
  push("--radius-md", `${tokens.radiusMd}px`)
  push("--radius-lg", `${tokens.radiusLg}px`)
  push("--radius-xl", `${tokens.radiusXl}px`)
  push("--grain-opacity", tokens.grainOpacity.toFixed(3))

  if (mode === "dark") {
    // CRT phosphor tokens — a dark, glowing instrument screen tinted to the
    // signal hue. Only set in dark; light inherits (screens stay lit-dark).
    const hue = signalHue ?? 40
    push("--display-bg", hsl(hue, 0.55, 0.09))
    push("--display-text", hsl(hue, 1, 0.65))
    push("--display-ghost", hslToRgba(hue, 1, 0.65, 0.08))
    push("--display-glow", hslToRgba(hue, 1, 0.65, 0.4))
  }

  lines.push("}")
  return lines.join("\n")
}

function hslToRgba(h: number, s: number, l: number, a: number): string {
  const hex = hslToHex(h, s, l).replace("#", "")
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Export both mode blocks as a copy/paste CSS string. */
export function exportAsCSS(name: string, params: VariantParams): string {
  const dark = exportBlock(name, derive(params, "dark"), "dark", params.signalHue)
  const light = exportBlock(name, derive(params, "light"), "light", params.signalHue)
  return `${dark}\n\n${light}`
}

// ─── Presets ──────────────────────────────────────────────────────────────────

/** Preset params for the named themes. radius/destructiveHue are the shared
 *  defaults (the 7 built-ins inherit :root radius + the canonical red). */
export const PRESETS: Record<string, VariantParams> = {
  amber:       { surfaceHue: 270, surfaceTemp: 0.80, signalHue: 40,  signalChroma: 0.65, textWarmth: 0.70, radius: 8, destructiveHue: 358 },
  copper:      { surfaceHue: 340, surfaceTemp: 0.85, signalHue: 25,  signalChroma: 0.60, textWarmth: 0.75, radius: 8, destructiveHue: 358 },
  midnight:    { surfaceHue: 220, surfaceTemp: 0.20, signalHue: 195, signalChroma: 0.55, textWarmth: 0.20, radius: 8, destructiveHue: 358 },
  "rose-gold": { surfaceHue: 280, surfaceTemp: 0.75, signalHue: 15,  signalChroma: 0.45, textWarmth: 0.60, radius: 8, destructiveHue: 358 },
  jade:        { surfaceHue: 220, surfaceTemp: 0.25, signalHue: 155, signalChroma: 0.50, textWarmth: 0.35, radius: 8, destructiveHue: 358 },
  bone:        { surfaceHue: 30,  surfaceTemp: 0.90, signalHue: 42,  signalChroma: 0.35, textWarmth: 0.80, radius: 8, destructiveHue: 358 },
  ultraviolet: { surfaceHue: 275, surfaceTemp: 0.80, signalHue: 45,  signalChroma: 0.70, textWarmth: 0.55, radius: 8, destructiveHue: 358 },
}
