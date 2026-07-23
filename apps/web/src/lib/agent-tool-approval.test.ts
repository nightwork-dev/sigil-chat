import { describe, expect, it } from "vitest"

import { serializeToolApprovalPreference } from "./agent-tool-approval"

describe("tool approval preference header", () => {
  it("keeps legacy global-only header values compact", () => {
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
