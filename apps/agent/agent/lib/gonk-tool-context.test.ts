import type { AuthenticatedPrincipal } from "@gonk/auth"
import { describe, expect, it } from "vitest"

import {
  approvalForGonkTool,
  authorizeGonkRequest,
  createFabricToolHostContext,
  createGonkAuthContext,
  fabricRestrictionPolicyRefs,
} from "./gonk-tool-context"

const principal: AuthenticatedPrincipal = {
  id: "owner-1",
  kind: "human",
  identity: {
    issuer: "sigil-chat",
    subject: "owner-1",
    method: "session",
  },
  roles: ["owner"],
  scopes: ["project:sigil-chat"],
}

describe("native Gonk tool context", () => {
  it("fails closed without current Eve authentication", () => {
    expect(() => createGonkAuthContext(dynamicContext())).toThrow(
      "GONK_EVE_AUTH_REQUIRED",
    )
  })

  it("reauthorizes the live resource scope for discovery and invocation", () => {
    let allowed = true
    const authorize = (action: "tool.discover" | "tool.invoke") =>
      authorizeGonkRequest(
        {
          request: {
            action,
            resource: { kind: "tool", target: "sigil-story-list" },
          },
          principal,
          resourceScope: "project:sigil-chat",
          personaId: undefined,
        },
        () => allowed,
      )

    expect(authorize("tool.discover").outcome).toBe("allow")
    allowed = false
    expect(authorize("tool.invoke").outcome).toBe("deny")
  })

  it("enforces tool roles after scope authorization", () => {
    const decision = authorizeGonkRequest(
      {
        request: {
          action: "tool.invoke",
          resource: {
            kind: "tool",
            target: "sigil-owner-only",
            metadata: { authorization: { requiredRole: "admin" } },
          },
        },
        principal,
        resourceScope: "project:sigil-chat",
        personaId: undefined,
      },
      () => true,
    )
    expect(decision.outcome).toBe("deny")
  })

  it("reads approval preference from the live Eve session context", () => {
    expect(
      approvalForGonkTool({
        tool: { name: "sigil-story-upsert" } as never,
        gonkApproval: { tier: "write" },
        dynamic: dynamicContext({
          sigilToolApproval: JSON.stringify({
            default: "ask",
            tools: { "sigil-story-upsert": "always" },
          }),
        }),
      }),
    ).toBe("not-applicable")
  })

  it("projects the immutable Eve binding into an exact Fabric execution seam", () => {
    const fabric = createFabricToolHostContext({
      binding: {
        applicationThreadId: "thread-1",
        personaId: "agent-a",
        homeScopeId: "workspace-a",
        initialPerspective: {
          focusScopeId: "workspace-a",
          viaScopeIds: ["project-a"],
        },
        additionalContextScopeIds: ["workspace-b"],
        subject: "owner-1",
      },
      callId: "call-3",
      eveSessionId: "eve-session-1",
      principalId: "owner-1",
      resourceScope: "session:thread-1",
      subject: "owner-1",
      turnId: "turn-7",
    })

    expect(fabric).toMatchObject({
      executionContext: {
        runId: "sigil-chat:thread:thread-1",
        runExecutionId: "sigil-chat:eve:eve-session-1:turn:turn-7",
        traceId: "sigil-chat:turn:turn-7",
        parentSpanId: "sigil-chat:tool:call-3",
        executionBindingId: expect.stringMatching(/^sigil-chat:/),
        runtimeSessionBindingId: expect.stringMatching(
          /^sigil-chat:eve:eve-session-1:/,
        ),
      },
      observedTurnId: "turn-7",
      restrictionPolicyRefs: ["private-local"],
    })
    expect(fabric.statePartitionRef).toBe(
      `sigil-chat:${fabric.executionContext.executionBindingDigest}`,
    )
  })

  it("requires an explicit policy change before a worker may use cloud inference", () => {
    expect(fabricRestrictionPolicyRefs({})).toEqual(["private-local"])
    expect(
      fabricRestrictionPolicyRefs({
        GONK_FABRIC_RESTRICTION_POLICY_REFS:
          " cloud-openai, audit-required,cloud-openai ",
      }),
    ).toEqual(["cloud-openai", "audit-required"])
  })
})

function dynamicContext(attributes?: Record<string, unknown>) {
  return {
    session: {
      id: "eve-session-1",
      auth: {
        current: attributes
          ? {
              attributes,
              authenticator: "jwt",
              issuer: "sigil-chat",
              principalId: "owner-1",
              principalType: "user",
              subject: "owner-1",
            }
          : null,
      },
    },
  } as never
}
