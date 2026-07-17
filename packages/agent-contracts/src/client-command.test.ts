import { describe, expect, it } from "vitest"

import { isAgentClientCommand } from "./client-command"
import { isAgentUiHighlightInput } from "./ui-highlight"

describe("agent client command contracts", () => {
  it("accepts semantic ui.highlight commands with stable targets", () => {
    expect(
      isAgentClientCommand({
        type: "ui.highlight",
        payload: {
          clearPrevious: false,
          actions: [
            {
              targetIds: ["passage:draft-02", "decision/publish"],
              effect: "pulse",
            },
          ],
        },
      }),
    ).toBe(true)
  })

  it("rejects selector-shaped ui.highlight actions", () => {
    expect(
      isAgentClientCommand({
        type: "ui.highlight",
        payload: {
          actions: [{ selector: "#target", effect: "pulse" }],
        },
      }),
    ).toBe(false)
  })

  it("keeps Gonk tool input stricter than the client envelope", () => {
    expect(
      isAgentClientCommand({
        type: "ui.highlight",
        payload: { clearPrevious: true },
      }),
    ).toBe(true)
    expect(isAgentUiHighlightInput({ clearPrevious: true })).toBe(false)
  })
})
