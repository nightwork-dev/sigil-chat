// Color-scheme engine — the GATE. Proves the color math BEFORE any UI is built:
// harmony hue offsets, a real (non-placeholder) perceptual distance, categorical
// max-min distinctness for n=3/5/8, dual-surface AA legibility, reserved-band
// avoidance, label→color stability + order-independence, and overall
// determinism. See the module header for the color-science decisions.

import { describe, expect, it } from "vitest"

import {
  contrastRatio,
  DEFAULT_STATUS_HUES,
  distinctColors,
  fitAccent,
  fitToSurfaces,
  generateScheme,
  harmony,
  hexToHsl,
  hexToOklab,
  inReservedBand,
  oklabToHex,
  perceptualDistance,
  relativeLuminance,
  reserveSemanticHues,
  selectStrategy,
  stableIndex,
  wcagRating,
} from "./color-scheme"

// Representative surfaces: a near-black dark envelope and a paper light one.
const DARK = "#0d0b0f"
const LIGHT = "#f5f0e8"

function minPairwiseDistance(colors: string[]): number {
  let min = Infinity
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      min = Math.min(min, perceptualDistance(colors[i], colors[j]))
    }
  }
  return min
}

// ─── WCAG core (mirrors theme-derive) ───────────────────────────────────────────

describe("WCAG core", () => {
  it("relative luminance: black 0, white 1", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5)
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5)
  })

  it("contrast ratio: black/white is 21:1, identical is 1:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1)
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5)
  })

  it("wcagRating bins at 4.5 and 7", () => {
    expect(wcagRating(8)).toBe("AAA")
    expect(wcagRating(4.5)).toBe("AA")
    expect(wcagRating(4.49)).toBe("fail")
  })
})

// ─── OKLab round-trip + perceptual distance ─────────────────────────────────────

describe("OKLab", () => {
  it("round-trips primaries within a rounding tolerance", () => {
    for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#808080", "#d4a853"]) {
      const back = oklabToHex(hexToOklab(hex))
      // sRGB↔OKLab↔sRGB with 8-bit quantization: allow ±2 per channel.
      const [r1, g1, b1] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
      const [r2, g2, b2] = [parseInt(back.slice(1, 3), 16), parseInt(back.slice(3, 5), 16), parseInt(back.slice(5, 7), 16)]
      expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(2)
      expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(2)
      expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(2)
    }
  })
})

describe("perceptualDistance is a real distance, not a placeholder", () => {
  it("identical colors have distance 0", () => {
    expect(perceptualDistance("#ff0000", "#ff0000")).toBe(0)
    expect(perceptualDistance("#4cb782", "#4cb782")).toBe(0)
  })

  it("is symmetric", () => {
    expect(perceptualDistance("#ff0000", "#0000ff")).toBeCloseTo(
      perceptualDistance("#0000ff", "#ff0000"),
      10,
    )
  })

  it("near hues are closer than far hues (perceptual ordering)", () => {
    const redToOrange = perceptualDistance("#ff0000", "#ff6600")
    const redToBlue = perceptualDistance("#ff0000", "#0000ff")
    expect(redToOrange).toBeLessThan(redToBlue)
  })

  it("satisfies the triangle inequality on a sample triple", () => {
    const ab = perceptualDistance("#ff0000", "#00ff00")
    const bc = perceptualDistance("#00ff00", "#0000ff")
    const ac = perceptualDistance("#ff0000", "#0000ff")
    expect(ac).toBeLessThanOrEqual(ab + bc + 1e-9)
  })
})

// ─── Harmony offsets ─────────────────────────────────────────────────────────────

describe("harmony hue offsets", () => {
  it("complementary is h, h+180", () => {
    expect(harmony(40, "complementary", 2)).toEqual([40, 220])
  })

  it("triadic is h, h+120, h+240", () => {
    expect(harmony(40, "triadic", 3)).toEqual([40, 160, 280])
  })

  it("split-complementary is h, h+150, h+210", () => {
    expect(harmony(0, "split-complementary", 3)).toEqual([0, 150, 210])
  })

  it("analogous is h, h+30, h-30 (wrapped)", () => {
    expect(harmony(10, "analogous", 3)).toEqual([10, 40, 340])
  })

  it("tetradic is h, h+90, h+180, h+270", () => {
    expect(harmony(30, "tetradic", 4)).toEqual([30, 120, 210, 300])
  })

  it("wraps hues into [0,360)", () => {
    expect(harmony(300, "triadic", 3)).toEqual([300, 60, 180])
  })

  it("selectStrategy is deterministic and n/mood aware", () => {
    expect(selectStrategy("#d4a853", 2, "neutral")).toBe("complementary")
    expect(selectStrategy("#d4a853", 2, "calm")).toBe("analogous")
    expect(selectStrategy("#d4a853", 3, "energetic")).toBe("triadic")
    expect(selectStrategy("#d4a853", 4, "calm")).toBe("analogous")
    expect(selectStrategy("#d4a853", 4, "energetic")).toBe("tetradic")
  })
})

// ─── Legibility fit ───────────────────────────────────────────────────────────

describe("legibility fit", () => {
  it("fitAccent clears the AA text target on a light surface", () => {
    const c = fitAccent(hexToHsl("#d4a853").h, 0.65, LIGHT, 4.5)
    expect(contrastRatio(c, LIGHT)).toBeGreaterThanOrEqual(4.5)
  })

  it("fitAccent clears the AA text target on a dark surface (lightens, not only darkens)", () => {
    const c = fitAccent(220, 0.65, DARK, 4.5)
    expect(contrastRatio(c, DARK)).toBeGreaterThanOrEqual(4.5)
  })

  it("fitToSurfaces clears the graphical-object AA target on BOTH surfaces", () => {
    for (const hue of [10, 90, 200, 300]) {
      const c = fitToSurfaces(hue, 0.65, [LIGHT, DARK], 3)
      expect(contrastRatio(c, LIGHT)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(c, DARK)).toBeGreaterThanOrEqual(3)
    }
  })
})

// ─── Categorical distinctness + dual-surface legibility ─────────────────────────

describe("categorical distinctColors", () => {
  // Thresholds are conservative floors below the observed minima (n=3 ≈ 0.26,
  // n=5 ≈ 0.14, n=8 ≈ 0.12); anything above ~0.05 in OKLab is clearly tellable
  // apart, so these prove genuine perceptual separation, not just non-collision.
  const cases: Array<{ n: number; minDist: number }> = [
    { n: 3, minDist: 0.2 },
    { n: 5, minDist: 0.1 },
    { n: 8, minDist: 0.08 },
  ]

  for (const { n, minDist } of cases) {
    it(`n=${n}: min pairwise perceptual distance clears ${minDist}`, () => {
      const colors = distinctColors(n, [LIGHT, DARK])
      expect(colors).toHaveLength(n)
      expect(minPairwiseDistance(colors)).toBeGreaterThan(minDist)
    })

    it(`n=${n}: every color clears AA on BOTH a light and a dark surface`, () => {
      const colors = distinctColors(n, [LIGHT, DARK])
      for (const c of colors) {
        expect(contrastRatio(c, LIGHT)).toBeGreaterThanOrEqual(3)
        expect(contrastRatio(c, DARK)).toBeGreaterThanOrEqual(3)
      }
    })

    it(`n=${n}: no color lands in a reserved status band`, () => {
      const colors = distinctColors(n, [LIGHT, DARK])
      for (const c of colors) {
        expect(inReservedBand(hexToHsl(c).h, DEFAULT_STATUS_HUES)).toBe(false)
      }
    })
  }

  it("is deterministic across repeated calls", () => {
    expect(distinctColors(5, [LIGHT, DARK])).toEqual(distinctColors(5, [LIGHT, DARK]))
  })
})

// ─── Reserved-hue guard ─────────────────────────────────────────────────────────

describe("reserveSemanticHues", () => {
  it("nudges a hue sitting on a status center out of the band", () => {
    const green = hexToHsl("#4cb782").h
    const [out] = reserveSemanticHues([green], DEFAULT_STATUS_HUES)
    expect(inReservedBand(out, DEFAULT_STATUS_HUES)).toBe(false)
  })

  it("leaves a hue already outside every band untouched", () => {
    // 270 (violet) is clear of red/green/amber/blue.
    expect(reserveSemanticHues([270], DEFAULT_STATUS_HUES)).toEqual([270])
  })

  it("resolves a set so none remain in any band", () => {
    const statusCenters = DEFAULT_STATUS_HUES.map((r) => r.hue)
    const out = reserveSemanticHues(statusCenters, DEFAULT_STATUS_HUES)
    for (const h of out) expect(inReservedBand(h, DEFAULT_STATUS_HUES)).toBe(false)
  })
})

// ─── Stable label → color ───────────────────────────────────────────────────────

describe("stableIndex + colorFor stability", () => {
  it("stableIndex is deterministic and in range", () => {
    for (const label of ["us-east", "us-west", "eu-central", "ap-south"]) {
      const a = stableIndex(label, 5)
      const b = stableIndex(label, 5)
      expect(a).toBe(b)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(5)
    }
  })

  it("colorFor(label) is identical across independent generateScheme calls", () => {
    const labels = ["us-east", "us-west", "eu-central", "ap-south"]
    const s1 = generateScheme({ labels }, [LIGHT, DARK])
    const s2 = generateScheme({ labels }, [LIGHT, DARK])
    for (const l of labels) expect(s1.colorFor(l)).toBe(s2.colorFor(l))
  })

  it("colorFor(label) is independent of label ORDER", () => {
    const a = generateScheme({ labels: ["us-east", "us-west", "eu-central"] }, [LIGHT, DARK])
    const b = generateScheme({ labels: ["eu-central", "us-east", "us-west"] }, [LIGHT, DARK])
    // Same label set, different order: each label keeps its color (the colors
    // array is order-independent for a fixed set, and the hash is order-free).
    expect(a.colorFor("us-east")).toBe(b.colorFor("us-east"))
    expect(a.colorFor("eu-central")).toBe(b.colorFor("eu-central"))
  })

  it("different labels generally map to different colors", () => {
    const labels = Array.from({ length: 8 }, (_, i) => `series-${i}`)
    const s = generateScheme({ labels }, [LIGHT, DARK])
    const distinct = new Set(labels.map((l) => s.colorFor(l)))
    // Not required to be a perfect bijection (hash collisions mod n are allowed),
    // but the mapping must spread across most slots, not collapse to one color.
    expect(distinct.size).toBeGreaterThanOrEqual(6)
  })
})

// ─── generateScheme composition + determinism ───────────────────────────────────

describe("generateScheme", () => {
  it("uses the harmony regime for a small seed-driven n", () => {
    const s = generateScheme({ seed: "#d4a853", n: 3, strategy: "triadic" }, [LIGHT])
    expect(s.regime).toBe("harmony")
    expect(s.strategy).toBe("triadic")
    expect(s.colors).toHaveLength(3)
    // Harmony accents fit AA text on the single surface.
    for (const c of s.colors) expect(contrastRatio(c, LIGHT)).toBeGreaterThanOrEqual(4.5)
  })

  it("switches to the categorical regime for a label set", () => {
    const s = generateScheme({ labels: ["a", "b", "c", "d", "e"] }, [LIGHT, DARK])
    expect(s.regime).toBe("categorical")
    expect(s.colors).toHaveLength(5)
  })

  it("switches to the categorical regime for large n (> 4)", () => {
    const s = generateScheme({ seed: "#d4a853", n: 6 }, [LIGHT, DARK])
    expect(s.regime).toBe("categorical")
    expect(s.colors).toHaveLength(6)
  })

  it("honors an explicit regime override against the automatic choice", () => {
    // n=3 would auto-pick harmony; force categorical.
    const cat = generateScheme({ seed: "#d4a853", n: 3, regime: "categorical" }, [LIGHT, DARK])
    expect(cat.regime).toBe("categorical")
    // n=5 would auto-pick categorical; force harmony.
    const harm = generateScheme({ seed: "#d4a853", n: 5, regime: "harmony" }, [LIGHT])
    expect(harm.regime).toBe("harmony")
    expect(harm.colors).toHaveLength(5)
  })

  it("harmony output avoids reserved status bands after the guard", () => {
    // A seed whose triadic rotation would otherwise land near a status hue.
    const s = generateScheme({ seed: "#4cb782", n: 3, strategy: "triadic" }, [LIGHT])
    for (const c of s.colors) {
      expect(inReservedBand(hexToHsl(c).h, DEFAULT_STATUS_HUES)).toBe(false)
    }
  })

  it("is fully deterministic for a fixed config", () => {
    const cfg = { seed: "#d4a853", n: 3, strategy: "auto" as const, mood: "energetic" as const }
    const a = generateScheme(cfg, [LIGHT, DARK])
    const b = generateScheme(cfg, [LIGHT, DARK])
    expect(a.colors).toEqual(b.colors)
    expect(a.strategy).toBe(b.strategy)
  })
})
