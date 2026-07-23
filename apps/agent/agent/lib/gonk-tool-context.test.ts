import type { AuthenticatedPrincipal } from "@gonk/auth"
import { describe, expect, it } from "vitest"

import {
  approvalForGonkTool,
  authorizeGonkRequest,
  createGonkAuthContext,
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
