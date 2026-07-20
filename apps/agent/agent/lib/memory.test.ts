import { describe, expect, it } from "vitest"
import { memoryTurn, sigilMemoryHost } from "./memory"

describe("Sigil memory turn identity", () => {
  it("binds missing or blank Eve session ids to a non-blank provisional identity", () => {
    for (const eveSessionId of [undefined, "", "   "]) {
      const identity = sigilMemoryHost.identityAtSessionStart(
        memoryTurn(eveSessionId, "user-1"),
      )

      expect(identity.binding.executionSessionId).toBe("new:user-1")
      expect(identity.binding.personaId).toBe("sigil-chat-eve")
      expect(identity.binding.channelId).toBe("sigil-chat")
    }
  })

  it("uses Eve's durable session id when it is present", () => {
    const identity = sigilMemoryHost.identityAtSessionStart(
      memoryTurn(" eve-session-1 ", " user-1 "),
    )

    expect(identity.binding.executionSessionId).toBe("eve-session-1")
  })
})
