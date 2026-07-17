// Fallback behavior for the two Badge adapters. Both must degrade to a neutral
// badge (never crash, never silently mis-tint) when their input map cannot
// resolve the value. Pure resolvers are tested directly; the render path is
// covered by the browser pass.

import { describe, expect, it } from "vitest"

import {
  resolveRampStep,
  resolveStatusVariant,
  type RampStep,
  type StatusVariant,
} from "./status-badge"

const RAMP: RampStep[] = [
  { max: 33, className: "c-low", glyph: "○" },
  { max: 66, className: "c-mid", glyph: "◐" },
  { max: 100, className: "c-high", glyph: "●" },
]

describe("resolveRampStep", () => {
  it("matches the first step whose max is >= value", () => {
    expect(resolveRampStep(10, RAMP).step?.className).toBe("c-low")
    expect(resolveRampStep(33, RAMP).step?.className).toBe("c-low") // boundary inclusive
    expect(resolveRampStep(34, RAMP).step?.className).toBe("c-mid")
    expect(resolveRampStep(66, RAMP).step?.className).toBe("c-mid")
    expect(resolveRampStep(67, RAMP).step?.className).toBe("c-high")
  })

  it("clamps a value above every step to the last step and flags it", () => {
    const res = resolveRampStep(999, RAMP)
    expect(res.step?.className).toBe("c-high")
    expect(res.clamped).toBe(true)
  })

  it("flags clamped=false for an in-range value", () => {
    expect(resolveRampStep(50, RAMP).clamped).toBe(false)
  })

  it("returns a null step (no clamped tint) for an empty ramp", () => {
    const res = resolveRampStep(50, [])
    expect(res.step).toBeNull()
    expect(res.clamped).toBe(false)
  })

  it("resolves a single-step ramp for any value at or below it", () => {
    const one: RampStep[] = [{ max: 10, className: "only", glyph: "●" }]
    expect(resolveRampStep(10, one).step?.className).toBe("only")
    expect(resolveRampStep(-5, one).step?.className).toBe("only")
  })
})

const VARIANTS: Record<string, StatusVariant> = {
  draft: { className: "v-draft", glyph: "✎", label: "Draft" },
  live: { className: "v-live", glyph: "●" },
}

describe("resolveStatusVariant", () => {
  it("returns the matched variant with its label/glyph", () => {
    const res = resolveStatusVariant("draft", VARIANTS)
    expect(res.variant?.className).toBe("v-draft")
    expect(res.label).toBe("Draft")
    expect(res.fallback).toBe(false)
  })

  it("falls back to the raw status string when no label is provided", () => {
    const res = resolveStatusVariant("live", VARIANTS)
    expect(res.variant?.className).toBe("v-live")
    expect(res.label).toBe("live")
    expect(res.fallback).toBe(false)
  })

  it("flags fallback and uses the raw status as the label for an unknown status", () => {
    const res = resolveStatusVariant("archived", VARIANTS)
    expect(res.variant).toBeNull()
    expect(res.fallback).toBe(true)
    expect(res.label).toBe("archived")
  })

  it("falls back for an empty variant map", () => {
    const res = resolveStatusVariant("anything", {})
    expect(res.variant).toBeNull()
    expect(res.fallback).toBe(true)
    expect(res.label).toBe("anything")
  })
})
