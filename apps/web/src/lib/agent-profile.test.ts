import { describe, expect, it } from "vitest"

import { agentPortraitUrl } from "./agent-profile"

describe("agentPortraitUrl", () => {
  it("uses versioned assets for the included personas", () => {
    expect(agentPortraitUrl("sigil-chat-atlas", false)).toBe(
      "/assets/personas/atlas.png",
    )
    expect(agentPortraitUrl("sigil-chat-eve", false)).toBe(
      "/assets/personas/eve.png",
    )
  })

  it("prefers an owner-uploaded private portrait", () => {
    expect(agentPortraitUrl("sigil-chat-eve", true)).toBe(
      "/api/agent-portrait?personaId=sigil-chat-eve",
    )
  })

  it("leaves unknown personas on their initial fallback", () => {
    expect(agentPortraitUrl("custom-persona", false)).toBeUndefined()
  })
})
