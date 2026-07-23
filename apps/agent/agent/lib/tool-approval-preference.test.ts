import { describe, expect, it } from "vitest"

import {
  parseToolApprovalPreference,
  toolApprovalModeFor,
} from "./tool-approval-preference"

describe("tool approval preference", () => {
  it("applies the global mode to native tool names", () => {
    expect(toolApprovalModeFor("always", "sigil-read-file")).toBe("always")
    expect(toolApprovalModeFor("ask", "sigil-read-file")).toBe("ask")
  })

  it("selects an exact per-tool override before the default", () => {
    const value = JSON.stringify({
      default: "ask",
      tools: { "sigil-read-file": "always" },
    })
    expect(toolApprovalModeFor(value, "sigil-read-file")).toBe("always")
    expect(toolApprovalModeFor(value, "sigil-delete-file")).toBe("ask")
  })

  it("fails closed for malformed client preferences", () => {
    expect(parseToolApprovalPreference("not-json")).toEqual({
      default: "ask",
      tools: {},
    })
    expect(
      toolApprovalModeFor(
        JSON.stringify({ default: "always", tools: { unsafe: "sometimes" } }),
        "unsafe",
      ),
    ).toBe("always")
  })
})
