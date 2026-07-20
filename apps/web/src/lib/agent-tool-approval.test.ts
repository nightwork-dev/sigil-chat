import { describe, expect, it } from "vitest"

import { serializeToolApprovalPreference } from "./agent-tool-approval"

describe("tool approval preference header", () => {
  it("keeps legacy global-only header values compact", () => {
    expect(serializeToolApprovalPreference("ask", {})).toBe("ask")
    expect(serializeToolApprovalPreference("always", {})).toBe("always")
  })

  it("includes exact qualified tool-name overrides", () => {
    expect(
      JSON.parse(
        serializeToolApprovalPreference("ask", {
          "gonk__sigil-read-file": "always",
        }),
      ),
    ).toEqual({
      default: "ask",
      tools: { "gonk__sigil-read-file": "always" },
    })
  })
})
