import { createSignedDelegationProvider } from "@gonk/eve-host/guard"
import {
  SIGIL_GONK_DELEGATION_AUDIENCE,
  SIGIL_GONK_DELEGATION_ISSUER,
} from "@workspace/agent-contracts/gonk-turn-delegation"
import { describe, expect, it } from "vitest"

import {
  authenticateEveTurnDelegation,
  createContainerScopeAuthorizationPolicy,
  resolveDelegatedAgentReach,
} from "../src/auth.js"
import { personalScopeId } from "../../agent/agent/lib/personal-scope.js"

const SECRET = "test-turn-delegation-secret-32bytes"

describe("Gonk Eve turn-delegation authentication", () => {
  it("projects Eve's signed end-user principal only while live policy allows it", async () => {
    let authorized = true
    const token = issueTurnDelegation({
      activeResourceScope: "workspace:holiday-launch",
      subject: "user-grantee",
    })
    const input = {
      bindings: bindingLookup("user-grantee"),
      now: 100,
      policy: { authorize: () => authorized },
      scope: { tier: "workspace" as const, id: "holiday-launch" },
      secret: SECRET,
      token,
    }

    await expect(authenticateEveTurnDelegation(input)).resolves.toMatchObject({
      actorSessionId: "eve-session-1",
      principalId: "user-grantee",
      scope: { tier: "workspace", id: "holiday-launch" },
    })

    // This is deliberately the same still-unexpired proof: revocation is a
    // policy read, not a cache expiry event.
    authorized = false
    await expect(authenticateEveTurnDelegation(input)).resolves.toBeUndefined()
  })

  it("rejects a bearer when scope or durable execution binding differs", async () => {
    const token = issueTurnDelegation({
      activeResourceScope: "project:brand",
      subject: "user-a",
    })

    await expect(
      authenticateEveTurnDelegation({
        bindings: bindingLookup("user-a"),
        now: 100,
        policy: { authorize: () => true },
        scope: { tier: "project", id: "commerce" },
        secret: SECRET,
        token,
      }),
    ).resolves.toBeUndefined()
    await expect(
      authenticateEveTurnDelegation({
        bindings: bindingLookup("user-a", { personaId: "other-persona" }),
        now: 100,
        policy: { authorize: () => true },
        scope: { tier: "project", id: "brand" },
        secret: SECRET,
        token,
      }),
    ).resolves.toBeUndefined()
    await expect(
      authenticateEveTurnDelegation({
        bindings: bindingLookup("user-a", {
          applicationThreadId: "other-thread",
        }),
        now: 100,
        policy: { authorize: () => true },
        scope: { tier: "project", id: "brand" },
        secret: SECRET,
        token,
      }),
    ).resolves.toBeUndefined()
  })

  it("rejects tampering and replay into an unbound Eve session", async () => {
    const token = issueTurnDelegation({
      activeResourceScope: "project:brand",
      subject: "user-a",
    })
    const input = {
      now: 100,
      policy: { authorize: () => true },
      scope: { tier: "project" as const, id: "brand" },
      secret: SECRET,
    }

    await expect(
      authenticateEveTurnDelegation({
        ...input,
        bindings: { getBinding: async () => undefined },
        token,
      }),
    ).resolves.toBeUndefined()
    await expect(
      authenticateEveTurnDelegation({
        ...input,
        bindings: bindingLookup("user-a"),
        token: `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`,
      }),
    ).resolves.toBeUndefined()
  })
})

describe("delegated agent reach", () => {
  it("classifies only the principal's durably bound personal session as principal reach", async () => {
    const bindings = {
      getBinding: async (sessionId: string) =>
        sessionId === "eve-personal"
          ? {
              applicationThreadId: "thread-1",
              homeScopeId: personalScopeId("user-a"),
              personaId: "persona-1",
              subject: "user-a",
            }
          : undefined,
    }

    await expect(
      resolveDelegatedAgentReach({
        actorSessionId: "eve-personal",
        bindings,
        principalId: "user-a",
      }),
    ).resolves.toBe("principal")
    await expect(
      resolveDelegatedAgentReach({
        actorSessionId: "eve-personal",
        bindings,
        principalId: "user-b",
      }),
    ).resolves.toBe("scope")
    await expect(
      resolveDelegatedAgentReach({ bindings, principalId: "user-a" }),
    ).resolves.toBe("scope")
  })
})

function issueTurnDelegation(input: {
  activeResourceScope: string
  subject: string
}) {
  return createSignedDelegationProvider({
    issuer: SIGIL_GONK_DELEGATION_ISSUER,
    audience: SIGIL_GONK_DELEGATION_AUDIENCE,
    secret: SECRET,
    authorize: () => ({ outcome: "deny", reason: "test" }),
  }).issue({
    issuer: SIGIL_GONK_DELEGATION_ISSUER,
    audience: SIGIL_GONK_DELEGATION_AUDIENCE,
    issuedAt: 100,
    expiresAt: 200,
    subject: input.subject,
    channelId: "thread-1",
    personaId: "persona-1",
    eveSessionId: "eve-session-1",
    correlationId: "turn-1",
    delegationId: "delegation-1",
    activeResourceScope: input.activeResourceScope,
  }, 100)
}

function bindingLookup(
  subject: string,
  overrides: Partial<{
    applicationThreadId: string
    personaId: string
  }> = {},
) {
  return {
    getBinding: async () => ({
      applicationThreadId: overrides.applicationThreadId ?? "thread-1",
      homeScopeId: personalScopeId(subject),
      personaId: overrides.personaId ?? "persona-1",
      subject,
    }),
  }
}

describe("container scope authorization", () => {
  it("does not let a stale exact grant revive a deleted container", () => {
    const policy = createContainerScopeAuthorizationPolicy({
      projects: { get: () => undefined },
      workspaces: { get: () => undefined },
      grants: {
        listActive: () => [
          {
            actions: ["tool" as const],
            principalId: "user-a",
            resourceScope: "workspace:deleted",
          },
        ],
      },
    })

    expect(
      policy.authorize({
        action: "tool",
        principalId: "user-a",
        resourceScope: "workspace:deleted",
      }),
    ).toBe(false)
  })

  it("re-authorizes a session against its live home while preserving personal homes", () => {
    let workspaceExists = true
    let projectMember = true
    const containers = {
      projects: {
        get: (id: string) =>
          id === "project-home"
            ? {
                members: projectMember
                  ? [{ principalId: "user-a", role: "member" as const }]
                  : [],
              }
            : undefined,
      },
      workspaces: {
        get: (id: string) =>
          id === "workspace-home" && workspaceExists
            ? { homeScopeId: "project-home", projectId: "project-home" }
            : undefined,
      },
    }
    const policy = createContainerScopeAuthorizationPolicy(containers, {
      owns: () => true,
      homeScopeId: (sessionId) =>
        sessionId === "personal-thread"
          ? personalScopeId("user-a")
          : sessionId === "workspace-thread"
            ? "workspace-home"
            : undefined,
    })
    const request = (sessionId: string) => ({
      action: "tool" as const,
      principalId: "user-a",
      resourceScope: `session:${sessionId}`,
    })

    expect(policy.authorize(request("workspace-thread"))).toBe(true)
    projectMember = false
    expect(policy.authorize(request("workspace-thread"))).toBe(false)
    projectMember = true
    workspaceExists = false
    expect(policy.authorize(request("workspace-thread"))).toBe(false)
    expect(policy.authorize(request("personal-thread"))).toBe(true)
  })
})
