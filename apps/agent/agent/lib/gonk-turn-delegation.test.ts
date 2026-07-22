import { createSignedDelegationProvider } from "@gonk/eve-host/guard"
import {
  SIGIL_GONK_DELEGATION_AUDIENCE,
  SIGIL_GONK_DELEGATION_ISSUER,
} from "@workspace/agent-contracts/gonk-turn-delegation"
import type { SessionContext } from "eve/context"
import { describe, expect, it } from "vitest"

import { createGonkTurnAuthProvider } from "./gonk-turn-delegation"

const secret = "0123456789abcdef0123456789abcdef"

describe("Gonk Eve turn delegation", () => {
  it("binds the authenticated principal, thread, persona, session, turn, and scope", async () => {
    const now = 1_800_000_000_000
    const auth = createGonkTurnAuthProvider(context(), secret, () => now)
    const result = await auth.getToken({
      principal: { type: "user", id: "user-1" },
    })
    const verifier = createSignedDelegationProvider({
      issuer: SIGIL_GONK_DELEGATION_ISSUER,
      audience: SIGIL_GONK_DELEGATION_AUDIENCE,
      secret,
      authorize: () => ({ outcome: "deny", reason: "test" }),
    })

    expect(verifier.verify(result.token, now)).toMatchObject({
      subject: "user-1",
      channelId: "thread-1",
      personaId: "persona-1",
      eveSessionId: "eve-session-1",
      correlationId: "turn-7",
      delegationId: "eve-session-1:turn-7",
      activeResourceScope: "workspace:workspace-1",
    })
    expect(result.expiresAt).toBe(now + 60_000)
  })

  it("rejects a mismatched connection principal", async () => {
    const auth = createGonkTurnAuthProvider(context(), secret)
    await expect(
      auth.getToken({ principal: { type: "user", id: "user-2" } }),
    ).rejects.toThrow("does not match")
  })
})

function context(): SessionContext {
  return {
    session: {
      id: "eve-session-1",
      turn: { id: "turn-7", sequence: 7 },
      auth: {
        initiator: null,
        current: {
          attributes: {
            sigilExecutionBinding: JSON.stringify({
              applicationThreadId: "thread-1",
              personaId: "persona-1",
              homeScopeId: "workspace-1",
              initialPerspective: {
                focusScopeId: "workspace-1",
                viaScopeIds: [],
              },
              additionalContextScopeIds: [],
            }),
            sigilResourceScope: "workspace:workspace-1",
          },
          authenticator: "test",
          principalId: "user-1",
          principalType: "user",
        },
      },
    },
    getSandbox: async () => {
      throw new Error("not used")
    },
    getSkill: () => {
      throw new Error("not used")
    },
  }
}
