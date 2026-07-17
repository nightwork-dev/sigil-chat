// ColorScope scoped-var shape. The vitest env is node (no DOM), so this proves
// the pure `--scheme-*` var map the primitive spreads onto its OWN element
// (never :root). Actual container-scoping + independence of two islands is
// proven in the real-browser pass (verification bar §2).

import { describe, expect, it } from "vitest"

import { contrastRatio } from "../lib/color-scheme"
import { schemeCssVars } from "./color-scope"

describe("schemeCssVars", () => {
  it("emits --scheme-N and --scheme-N-foreground for each color", () => {
    const vars = schemeCssVars(["#c6512a", "#3970d5", "#1d871d"])
    expect(vars["--scheme-1"]).toBe("#c6512a")
    expect(vars["--scheme-2"]).toBe("#3970d5")
    expect(vars["--scheme-3"]).toBe("#1d871d")
    expect(Object.keys(vars)).toHaveLength(6) // 3 colors × (color + foreground)
  })

  it("gives each color a readable black/white ink", () => {
    const vars = schemeCssVars(["#ffffff", "#000000"])
    // White swatch → dark ink; black swatch → light ink. Ink clears large-text AA.
    expect(contrastRatio("#ffffff", vars["--scheme-1-foreground"])).toBeGreaterThanOrEqual(3)
    expect(contrastRatio("#000000", vars["--scheme-2-foreground"])).toBeGreaterThanOrEqual(3)
  })

  it("only names --scheme-* custom properties (never a global token)", () => {
    const vars = schemeCssVars(["#c6512a"])
    for (const key of Object.keys(vars)) expect(key.startsWith("--scheme-")).toBe(true)
  })
})
