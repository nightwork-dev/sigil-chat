import type { SessionAuthContext } from "eve/context"
import { describe, expect, it } from "vitest"

import { bindEveExecutionSession } from "./eve-session-owner-store"
import { MemoryEveSessionOwnerStore } from "./eve-session-owners"

describe("Eve session-start binding hook", () => {
  it("persists the immutable application binding before tools can run", async () => {
    const store = new MemoryEveSessionOwnerStore()

    await bindEveExecutionSession(
      { sessionId: "eve-session-1", caller: caller() },
      store,
    )

    await expect(store.getBinding("eve-session-1")).resolves.toMatchObject({
      applicationThreadId: "thread-1",
      homeScopeId: "workspace-1",
      personaId: "persona-1",
      subject: "user-1",
    })
  })

  it("fails closed without an authenticated execution binding", async () => {
    const store = new MemoryEveSessionOwnerStore()
    await expect(
      bindEveExecutionSession({ sessionId: "eve-session-1", caller: null }, store),
    ).rejects.toThrow("no authenticated caller")
  })
})

function caller(): SessionAuthContext {
  return {
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
    },
    authenticator: "test",
    principalId: "user-1",
    principalType: "user",
  }
}
