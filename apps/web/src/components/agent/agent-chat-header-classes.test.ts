// Regression guard for the HUD-card dead-gap bug: flex-1 is correct only in
// the horizontal rail row; in the surface (vertical column) position it made
// the header grow and eat the conversation's space.

import { describe, expect, it } from "vitest"

import { agentChatHeaderClasses } from "./agent-chat-header"

describe("agentChatHeaderClasses", () => {
  it("surface: no flex-1 — the header takes its natural height", () => {
    const classes = agentChatHeaderClasses("surface", true)
    expect(classes).not.toContain("flex-1")
    expect(classes).toContain("shrink-0")
    expect(classes).toContain("border-b")
  })

  it("rail: flex-1 — fills the horizontal rail", () => {
    const classes = agentChatHeaderClasses("rail", true)
    expect(classes).toContain("flex-1")
    expect(classes).not.toContain("border-b")
  })
})
