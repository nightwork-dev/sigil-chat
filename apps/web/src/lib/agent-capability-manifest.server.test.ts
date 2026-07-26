import { describe, expect, it } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import { AuthenticationRequiredError } from "./auth/session"
import {
  buildCapabilityManifestForSession,
  type CapabilityManifestSources,
} from "./agent-capability-manifest.server"

function session(userId: string): SigilAuthSession {
  return { user: { id: userId } } as SigilAuthSession
}

function sources(
  overrides: Partial<CapabilityManifestSources> = {},
): CapabilityManifestSources {
  return {
    resolveBinding: (principalId, threadId) => {
      if (principalId !== "user-1" || threadId !== "thread-1") {
        throw new Error(`Agent thread ${threadId} was not found.`)
      }
      return {
        personaId: "sigil-chat-eve",
        applicationThreadId: "thread-1",
        focusScopeId: "personal-scope:user-1",
        additionalContextScopeIds: ["project:atlas"],
      }
    },
    canMutate: () => true,
    loadHostAndTools: async () => ({
      host: { id: "eve", label: "Eve", model: "gpt-x" },
      tools: [
        { name: "sigil-review-add-annotation", description: "Attach feedback" },
      ],
    }),
    now: () => 1_700_000_000,
    ...overrides,
  }
}

describe("buildCapabilityManifestForSession", () => {
  it("rejects an anonymous session", async () => {
    await expect(
      buildCapabilityManifestForSession(null, "thread-1", sources()),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError)
  })

  it("rejects a blank thread id", async () => {
    await expect(
      buildCapabilityManifestForSession(session("user-1"), "  ", sources()),
    ).rejects.toThrow("thread id is required")
  })

  it("reconstructs identity and scope from the verified binding", async () => {
    const manifest = await buildCapabilityManifestForSession(
      session("user-1"),
      "thread-1",
      sources(),
    )
    expect(manifest.identity).toEqual({
      principalId: "user-1",
      personaId: "sigil-chat-eve",
      applicationThreadId: "thread-1",
    })
    expect(manifest.visibility.activeScope).toBe("personal-scope:user-1")
    expect(manifest.visibility.readableContextScopes).toEqual(["project:atlas"])
    expect(manifest.actions.tools.map((t) => t.name)).toEqual([
      "sigil-review-add-annotation",
    ])
    expect(manifest.actions.mutationsAllowed).toBe(true)
  })

  it("cannot be widened by the browser: only the resolved binding is used", async () => {
    // The function accepts ONLY a session and a thread id — there is no
    // parameter for scope, tools, persona, or mutation rights. Even if the
    // browser tried to pass a broader thread id, resolveBinding is the sole
    // authority and refuses a thread the principal does not own.
    await expect(
      buildCapabilityManifestForSession(
        session("user-1"),
        "someone-elses-thread",
        sources(),
      ),
    ).rejects.toThrow("was not found")

    // And the authorized manifest reflects the binding's scope, never a value
    // the caller could inject.
    const manifest = await buildCapabilityManifestForSession(
      session("user-1"),
      "thread-1",
      sources(),
    )
    expect(manifest.visibility.activeScope).not.toContain("workspace:")
    expect(manifest.visibility.activeScope).toBe("personal-scope:user-1")
  })

  it("reports a read-only scope when mutation is not authorized", async () => {
    const manifest = await buildCapabilityManifestForSession(
      session("user-1"),
      "thread-1",
      sources({ canMutate: () => false }),
    )
    expect(manifest.actions.mutationsAllowed).toBe(false)
  })
})
