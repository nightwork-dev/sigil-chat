import { describe, expect, it } from "vitest"

import {
  FEATURE_FLAG_REGISTRY,
  getFeatureFlagDefinition,
  isKnownFeatureFlagId,
  listFeatureFlagDefinitions,
} from "./registry"

describe("feature flag registry", () => {
  it("declares at least one real flag", () => {
    expect(Object.keys(FEATURE_FLAG_REGISTRY).length).toBeGreaterThan(0)
  })

  it("recognizes a declared id and rejects an undeclared one", () => {
    expect(isKnownFeatureFlagId("surfaces.reducerStudio")).toBe(true)
    expect(isKnownFeatureFlagId("not.a.real.flag")).toBe(false)
  })

  it("resolves the definition for a declared id", () => {
    const definition = getFeatureFlagDefinition("surfaces.reducerStudio")
    expect(definition.id).toBe("surfaces.reducerStudio")
    expect(typeof definition.description).toBe("string")
    expect(definition.description.length).toBeGreaterThan(0)
    expect(typeof definition.defaultEnabled).toBe("boolean")
    expect(typeof definition.ownerVisible).toBe("boolean")
  })

  it("lists every declared definition", () => {
    const listed = listFeatureFlagDefinitions()
    expect(listed.length).toBe(Object.keys(FEATURE_FLAG_REGISTRY).length)
    expect(listed.map((flag) => flag.id)).toContain("surfaces.reducerStudio")
  })
})
