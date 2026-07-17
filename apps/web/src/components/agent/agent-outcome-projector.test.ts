import { describe, expect, it } from "vitest"

import { extractClientCommand } from "./agent-outcome-projector"

describe("extractClientCommand", () => {
  const command = {
    type: "ui.highlight",
    payload: { actions: [{ selector: "#target", effect: "pulse" }] },
  }

  it.each([
    { clientCommand: command },
    { data: { clientCommand: command } },
    { structuredContent: { clientCommand: command } },
  ])(
    "extracts client commands from supported tool output envelopes",
    (output) => {
      expect(extractClientCommand(output)).toEqual(command)
    },
  )

  it("ignores unrelated and malformed tool output", () => {
    expect(extractClientCommand(null)).toBeNull()
    expect(extractClientCommand({ data: "not-an-envelope" })).toBeNull()
    expect(extractClientCommand({ structuredContent: {} })).toBeNull()
  })
})
