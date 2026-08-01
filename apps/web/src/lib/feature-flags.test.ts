import { afterEach, describe, expect, it, vi } from "vitest"

import {
  FeatureFlagRefusedError,
  isFeatureFlagEnabled,
  parseSetFeatureFlagRequest,
  resolveFeatureFlagStates,
} from "./feature-flags"

const DECLARED_ID = "surfaces.reducerStudio"

describe("isFeatureFlagEnabled", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("resolves the declared default when there is no override", () => {
    expect(isFeatureFlagEnabled(DECLARED_ID, {})).toBe(true)
  })

  it("an override takes precedence over the declared default", () => {
    expect(isFeatureFlagEnabled(DECLARED_ID, { [DECLARED_ID]: false })).toBe(
      false,
    )
    expect(isFeatureFlagEnabled(DECLARED_ID, { [DECLARED_ID]: true })).toBe(
      true,
    )
  })

  // Acceptance criterion 2: unknown/undeclared flag reads evaluate
  // default-off and are surfaced in dev logs.
  it("evaluates an undeclared id default-off and warns loudly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    expect(isFeatureFlagEnabled("not.a.real.flag", { "not.a.real.flag": true })).toBe(
      false,
    )
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain("not.a.real.flag")
  })
})

describe("resolveFeatureFlagStates", () => {
  it("resolves every declared flag against one overrides snapshot", () => {
    const states = resolveFeatureFlagStates({ [DECLARED_ID]: false })
    const state = states.find((flag) => flag.id === DECLARED_ID)
    expect(state).toBeDefined()
    expect(state?.enabled).toBe(false)
    expect(typeof state?.description).toBe("string")
  })
})

describe("parseSetFeatureFlagRequest", () => {
  it("accepts a well-formed request for a declared flag", () => {
    expect(
      parseSetFeatureFlagRequest({ id: DECLARED_ID, enabled: false }),
    ).toEqual({ id: DECLARED_ID, enabled: false })
  })

  it("trims the id", () => {
    expect(
      parseSetFeatureFlagRequest({ id: `  ${DECLARED_ID}  `, enabled: true }),
    ).toEqual({ id: DECLARED_ID, enabled: true })
  })

  for (const invalid of [
    null,
    "a string",
    [],
    { id: DECLARED_ID },
    { enabled: true },
    { id: DECLARED_ID, enabled: "true" },
    { id: "", enabled: true },
    { id: DECLARED_ID, enabled: true, extra: "field" },
    { id: "not.a.real.flag", enabled: true },
  ]) {
    it(`refuses ${JSON.stringify(invalid)}`, () => {
      expect(() => parseSetFeatureFlagRequest(invalid)).toThrow(
        FeatureFlagRefusedError,
      )
    })
  }
})
