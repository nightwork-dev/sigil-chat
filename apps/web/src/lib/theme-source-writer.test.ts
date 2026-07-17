// Pure tests for the dev-only source writer. The whole point of keeping these
// functions pure (text in → text out) is that idempotency is testable: insert
// once, then re-insert with the same name → byte-identical output.

import { describe, expect, it } from "vitest"

import {
  validateThemeName,
  themeCssExists,
  upsertThemeCss,
  upsertThemeRegistration,
  upsertPreset,
  paramsLiteral,
} from "./theme-source-writer"

// A miniature stand-in for themes.css with the real structural anchors: dark
// blocks up top, the box-drawing light banner, then light blocks.
const CSS = `.theme-amber {
  --color-background: #0d0b0f;
}

/* ════════════════════════════════════════════════════════════════════════════
 * LIGHT MODE — per-envelope surface inversions.
 * ════════════════════════════════════════════════════════════════════════════ */

.light {
  color-scheme: light;
}

.theme-amber.light {
  --color-background: #f0e9db;
}
`

const DARK = `.theme-neo {\n  --color-background: #101010;\n}`
const LIGHT = `.theme-neo.light {\n  --color-background: #f5f5f5;\n}`

describe("validateThemeName", () => {
  it("accepts kebab-case names", () => {
    expect(validateThemeName("neo").ok).toBe(true)
    expect(validateThemeName("rose-gold").ok).toBe(true)
    expect(validateThemeName("neo2").ok).toBe(true)
  })
  it("rejects bad casing / symbols / leading digit", () => {
    expect(validateThemeName("Neo").ok).toBe(false)
    expect(validateThemeName("neo_gold").ok).toBe(false)
    expect(validateThemeName("2neo").ok).toBe(false)
    expect(validateThemeName("").ok).toBe(false)
    expect(validateThemeName("neo-").ok).toBe(false)
  })
  it("rejects reserved names", () => {
    expect(validateThemeName("light").ok).toBe(false)
    expect(validateThemeName("dark").ok).toBe(false)
    expect(validateThemeName("system").ok).toBe(false)
    expect(validateThemeName("theme").ok).toBe(false)
  })
})

describe("upsertThemeCss", () => {
  it("inserts a new dark block before the light banner and appends the light block", () => {
    const out = upsertThemeCss(CSS, "neo", DARK, LIGHT)
    expect(themeCssExists(out, "neo")).toBe(true)
    // dark block sits before the banner
    expect(out.indexOf(".theme-neo {")).toBeLessThan(out.indexOf("/* ═"))
    // light block sits after the banner
    expect(out.indexOf(".theme-neo.light {")).toBeGreaterThan(out.indexOf("/* ═"))
    // did not clobber the existing amber blocks
    expect(out).toContain(".theme-amber {")
    expect(out).toContain(".theme-amber.light {")
  })

  it("is idempotent — re-inserting the same name does not duplicate", () => {
    const once = upsertThemeCss(CSS, "neo", DARK, LIGHT)
    const twice = upsertThemeCss(once, "neo", DARK, LIGHT)
    expect(twice).toBe(once)
    expect(twice.match(/\.theme-neo \{/g)?.length).toBe(1)
    expect(twice.match(/\.theme-neo\.light \{/g)?.length).toBe(1)
  })

  it("updates in place when the tokens change", () => {
    const once = upsertThemeCss(CSS, "neo", DARK, LIGHT)
    const changed = upsertThemeCss(once, "neo", `.theme-neo {\n  --color-background: #222222;\n}`, LIGHT)
    expect(changed).toContain("#222222")
    expect(changed).not.toContain("#101010")
    expect(changed.match(/\.theme-neo \{/g)?.length).toBe(1)
  })
})

const THEME_TSX = `export const THEMES = [
  {
    className: "theme-amber",
    label: "Amber",
    description: "Precision instrument in a dark room",
    signal: "#d4a853",
    void: "#0d0b0f",
    paper: "#f0e9db",
  },
] as const
`

describe("upsertThemeRegistration", () => {
  const reg = {
    className: "theme-neo",
    label: "Neo",
    description: "Authored in Theme Studio",
    signal: "#daab4e",
    void: "#0a090b",
    paper: "#efe9dc",
  }

  it("inserts a new entry before the array close", () => {
    const out = upsertThemeRegistration(THEME_TSX, reg)
    expect(out).toContain(`className: "theme-neo"`)
    expect(out.trimEnd().endsWith("] as const")).toBe(true)
    expect(out).toContain(`className: "theme-amber"`)
  })

  it("is idempotent", () => {
    const once = upsertThemeRegistration(THEME_TSX, reg)
    const twice = upsertThemeRegistration(once, reg)
    expect(twice).toBe(once)
    expect(twice.match(/className: "theme-neo"/g)?.length).toBe(1)
  })
})

const DERIVE_TS = `export const PRESETS: Record<string, VariantParams> = {
  amber:       { surfaceHue: 270, surfaceTemp: 0.80, signalHue: 40, signalChroma: 0.65, textWarmth: 0.70, radius: 8, destructiveHue: 358 },
}
`

describe("upsertPreset", () => {
  const lit = paramsLiteral({
    surfaceHue: 200, surfaceTemp: 0.5, signalHue: 300, signalChroma: 0.6, textWarmth: 0.4, radius: 10, destructiveHue: 358,
  })

  it("serializes params compactly", () => {
    expect(lit).toBe("{ surfaceHue: 200, surfaceTemp: 0.5, signalHue: 300, signalChroma: 0.6, textWarmth: 0.4, radius: 10, destructiveHue: 358 }")
  })

  it("inserts a new preset before the record close", () => {
    const out = upsertPreset(DERIVE_TS, "neo", lit)
    expect(out).toContain("neo: {")
    expect(out).toContain("amber:")
  })

  it("quotes non-identifier keys", () => {
    const out = upsertPreset(DERIVE_TS, "rose-gold", lit)
    expect(out).toContain(`"rose-gold": {`)
  })

  it("is idempotent", () => {
    const once = upsertPreset(DERIVE_TS, "neo", lit)
    const twice = upsertPreset(once, "neo", lit)
    expect(twice).toBe(once)
    expect(twice.match(/\n  neo: \{/g)?.length).toBe(1)
  })
})
