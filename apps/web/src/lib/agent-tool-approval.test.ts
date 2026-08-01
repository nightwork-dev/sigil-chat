import { describe, expect, it } from "vitest"

import {
  effectiveToolApprovalOverrides,
  normalizePerAgentOverrides,
  serializeToolApprovalPreference,
} from "./agent-tool-approval"

describe("tool approval preference header", () => {
  it("keeps global-only header values compact", () => {
    expect(serializeToolApprovalPreference("ask", {})).toBe("ask")
    expect(serializeToolApprovalPreference("always", {})).toBe("always")
  })

  it("includes exact native tool-name overrides", () => {
    expect(
      JSON.parse(
        serializeToolApprovalPreference("ask", {
          "sigil-read-file": "always",
        }),
      ),
    ).toEqual({
      default: "ask",
      tools: { "sigil-read-file": "always" },
    })
  })
})

describe("per-agent overrides (MA.4)", () => {
  it("migrates a legacy flat map into the account-wide layer", () => {
    expect(normalizePerAgentOverrides({ "sigil-read-file": "always" })).toEqual(
      { "*": { "sigil-read-file": "always" } },
    )
  })

  it("resolves identically after migration — flat and migrated agree", () => {
    const flat = { "sigil-read-file": "always", "sigil-run-graph": "ask" }
    const migrated = normalizePerAgentOverrides(flat)
    expect(effectiveToolApprovalOverrides(migrated)).toEqual(flat)
    expect(effectiveToolApprovalOverrides(migrated, "Eve")).toEqual(flat)
  })

  it("layers a named agent over the account-wide layer", () => {
    const overrides = normalizePerAgentOverrides({
      "*": { "sigil-read-file": "always", "sigil-run-graph": "ask" },
      Eve: { "sigil-run-graph": "always" },
    })
    expect(effectiveToolApprovalOverrides(overrides, "Eve")).toEqual({
      "sigil-read-file": "always",
      "sigil-run-graph": "always",
    })
    // Another agent sees only the account-wide layer.
    expect(effectiveToolApprovalOverrides(overrides, "referee")).toEqual({
      "sigil-read-file": "always",
      "sigil-run-graph": "ask",
    })
  })

  it("drops malformed layers and modes instead of guessing", () => {
    expect(
      normalizePerAgentOverrides({
        "*": { "sigil-read-file": "sometimes", "": "always" },
        Eve: "always",
        ok: { tool: "ask" },
      }),
    ).toEqual({ ok: { tool: "ask" } })
    expect(normalizePerAgentOverrides(null)).toEqual({})
    expect(normalizePerAgentOverrides([["a", "ask"]])).toEqual({})
  })
})
