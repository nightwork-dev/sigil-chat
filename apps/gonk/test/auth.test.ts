import { issueScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"
import { describe, expect, it } from "vitest"

import {
  authenticateScopeDelegation,
  createContainerScopeAuthorizationPolicy,
  resolveDelegatedAgentReach,
} from "../src/auth.js"
import { personalScopeId } from "../../agent/agent/lib/personal-scope.js"

const SECRET = "test-scope-delegation-secret"

describe("Gonk scope-delegation authentication", () => {
  it("projects Eve's signed end-user principal only while live policy allows it", async () => {
    let authorized = true
    const proof = issueScopeDelegation(
      {
        expiresAt: 200,
        scope: "workspace:holiday-launch",
        subject: "user-grantee",
      },
      SECRET,
    )
    const input = {
      now: 100,
      policy: { authorize: () => authorized },
      proof,
      scope: { tier: "workspace" as const, id: "holiday-launch" },
      secret: SECRET,
    }

    await expect(authenticateScopeDelegation(input)).resolves.toEqual({
      principalId: "user-grantee",
      scope: { tier: "workspace", id: "holiday-launch" },
    })

    // This is deliberately the same still-unexpired proof: revocation is a
    // policy read, not a cache expiry event.
    authorized = false
    await expect(authenticateScopeDelegation(input)).resolves.toBeUndefined()
  })

  it("rejects a proof when the supplied scope differs from its signed target", async () => {
    const proof = issueScopeDelegation(
      { expiresAt: 200, scope: "project:brand", subject: "user-a" },
      SECRET,
    )

    await expect(
      authenticateScopeDelegation({
        now: 100,
        policy: { authorize: () => true },
        proof,
        scope: { tier: "project", id: "commerce" },
        secret: SECRET,
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
              homeScopeId: personalScopeId("user-a"),
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
