// Pure tests for the derivation engine + WCAG contrast utilities.
// No DOM (applyDerivedTokens is excluded — it touches `document`).

import { describe, expect, it } from "vitest"

import {
  derive,
  contrastRatio,
  relativeLuminance,
  wcagRating,
  exportBlock,
  exportAsCSS,
  PRESETS,
} from "./theme-derive"

const amber = PRESETS.amber

describe("contrastRatio (WCAG)", () => {
  it("is 21:1 for black on white and symmetric", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0)
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0)
  })

  it("is 1:1 for identical colors", () => {
    expect(contrastRatio("#8a5f0f", "#8a5f0f")).toBeCloseTo(1, 5)
  })

  it("matches a known mid pairing within tolerance", () => {
    // deep amber signal on warm cream paper — the hand-tuned amber.light pair
    expect(contrastRatio("#8a5f0f", "#f0e9db")).toBeGreaterThan(4.5)
  })

  it("relativeLuminance is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5)
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5)
  })

  it("wcagRating thresholds", () => {
    expect(wcagRating(21)).toBe("AAA")
    expect(wcagRating(4.5)).toBe("AA")
    expect(wcagRating(4.49)).toBe("fail")
    expect(wcagRating(3)).toBe("fail")
  })
})

describe("derive — dark path (unchanged output for presets)", () => {
  it("reproduces the canonical dark amber surface + signal (frozen output)", () => {
    const t = derive(amber, "dark")
    // Frozen values — updated 2026-07-09 when surface saturation/lightness was
    // bumped so Surface Hue is perceptible (was near-invisible at the old
    // sat 0.04–0.12 / L 0.04–0.095 combo). Signal is unaffected (unchanged).
    expect(t.background).toBe("#0f0619")
    expect(t.primary).toBe("#daab4e")
    // near-black background, light ink
    expect(relativeLuminance(t.background)).toBeLessThan(0.02)
    expect(relativeLuminance(t.foreground)).toBeGreaterThan(0.6)
  })

  it("defaults to dark when no mode is given", () => {
    expect(derive(amber)).toEqual(derive(amber, "dark"))
  })

  it("Surface Hue visibly changes the void/surface colors (not a no-op)", () => {
    const rotated = derive({ ...amber, surfaceHue: (amber.surfaceHue + 90) % 360 }, "dark")
    const base = derive(amber, "dark")
    expect(rotated.background).not.toBe(base.background)
    // "visible" = a real per-channel delta, not a rounding-noise flip
    const delta = (a: string, b: string) =>
      Math.max(
        Math.abs(parseInt(a.slice(1, 3), 16) - parseInt(b.slice(1, 3), 16)),
        Math.abs(parseInt(a.slice(3, 5), 16) - parseInt(b.slice(3, 5), 16)),
        Math.abs(parseInt(a.slice(5, 7), 16) - parseInt(b.slice(5, 7), 16)),
      )
    expect(delta(rotated.background, base.background)).toBeGreaterThan(8)
  })
})

describe("derive — light path (surface inversion, AA-safe)", () => {
  const t = derive(amber, "light")

  it("produces a paper tone tinted by SURFACE hue (not signal hue)", () => {
    // FIX 2026-07-09: paper used to tint off signalHue (a no-op for the
    // Surface Hue slider in light mode). It now tints off surfaceHue —
    // amber's surfaceHue is 270 (purple corridor), so amber-light paper is a
    // faint lavender-cream, not the warm-cream you'd get from signalHue=40.
    expect(contrastRatio(t.background, "#e6dcef")).toBeLessThan(1.02)
    expect(relativeLuminance(t.background)).toBeGreaterThan(0.7)
  })

  it("Surface Hue visibly changes the paper color (not a no-op)", () => {
    const rotated = derive({ ...amber, surfaceHue: (amber.surfaceHue + 90) % 360 }, "light")
    const base = derive(amber, "light")
    expect(rotated.background).not.toBe(base.background)
    const delta = (a: string, b: string) =>
      Math.max(
        Math.abs(parseInt(a.slice(1, 3), 16) - parseInt(b.slice(1, 3), 16)),
        Math.abs(parseInt(a.slice(3, 5), 16) - parseInt(b.slice(3, 5), 16)),
        Math.abs(parseInt(a.slice(5, 7), 16) - parseInt(b.slice(5, 7), 16)),
      )
    expect(delta(rotated.background, base.background)).toBeGreaterThan(8)
  })

  it("flips ink dark-on-light", () => {
    expect(relativeLuminance(t.foreground)).toBeLessThan(0.05)
  })

  it("signal clears WCAG AA (4.5:1) as fill on paper", () => {
    expect(contrastRatio(t.primary, t.background)).toBeGreaterThanOrEqual(4.5)
  })

  it("body + muted text clear AA on their surfaces", () => {
    expect(contrastRatio(t.foreground, t.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(t.mutedForeground, t.background)).toBeGreaterThanOrEqual(4)
  })

  it("all 7 presets yield an AA-legible light signal", () => {
    for (const [, p] of Object.entries(PRESETS)) {
      const lt = derive(p, "light")
      expect(contrastRatio(lt.primary, lt.background)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe("hslToHex sextant correctness (destructive hue)", () => {
  it("destructiveHue ~358 renders red (r > b), not blue", () => {
    const t = derive({ ...amber, destructiveHue: 358 }, "dark")
    const r = parseInt(t.destructive.slice(1, 3), 16)
    const b = parseInt(t.destructive.slice(5, 7), 16)
    expect(r).toBeGreaterThan(b)
  })

  it("pure blue (h=250) renders blue (b > r) and pure red (h=0) renders red", () => {
    const blue = derive({ ...amber, signalHue: 250, signalChroma: 1 }, "dark").primary
    const red = derive({ ...amber, signalHue: 0, signalChroma: 1 }, "dark").primary
    expect(parseInt(blue.slice(5, 7), 16)).toBeGreaterThan(parseInt(blue.slice(1, 3), 16))
    expect(parseInt(red.slice(1, 3), 16)).toBeGreaterThan(parseInt(red.slice(5, 7), 16))
  })
})

describe("radius derivation", () => {
  it("radius=8 reproduces the default 6/8/12/16 stack", () => {
    const t = derive({ ...amber, radius: 8 }, "dark")
    expect([t.radiusSm, t.radiusMd, t.radiusLg, t.radiusXl]).toEqual([6, 8, 12, 16])
  })

  it("scales proportionally", () => {
    const t = derive({ ...amber, radius: 0 }, "dark")
    expect([t.radiusSm, t.radiusMd, t.radiusLg, t.radiusXl]).toEqual([0, 0, 0, 0])
  })
})

describe("exportBlock / exportAsCSS", () => {
  it("emits the right selector per mode", () => {
    expect(exportBlock("neo", derive(amber, "dark"), "dark", amber.signalHue)).toMatch(/^\.theme-neo \{/)
    expect(exportBlock("neo", derive(amber, "light"), "light", amber.signalHue)).toMatch(/^\.theme-neo\.light \{/)
  })

  it("dark block carries display tokens, light block does not", () => {
    const dark = exportBlock("neo", derive(amber, "dark"), "dark", amber.signalHue)
    const light = exportBlock("neo", derive(amber, "light"), "light", amber.signalHue)
    expect(dark).toContain("--display-bg")
    expect(light).not.toContain("--display-bg")
  })

  it("exportAsCSS emits both blocks", () => {
    const css = exportAsCSS("neo", amber)
    expect(css).toContain(".theme-neo {")
    expect(css).toContain(".theme-neo.light {")
    expect(css).toContain("--radius-md")
  })
})
