import { describe, expect, it } from "vitest"
import { issueAgentSessionBinding } from "@workspace/agent-contracts/session-binding.server"

import {
  EveSessionBindingVerificationError,
  requireVerifiedEveSessionBinding,
} from "./eve-session-binding"

const secret = "test-session-binding-secret"
const now = 1_750_000_000

function proof({
  eveSessionId,
  subject = "user-1",
}: {
  eveSessionId?: string
  subject?: string
} = {}) {
  return issueAgentSessionBinding(
    {
      additionalContextScopeIds: ["workspace-b"],
      applicationThreadId: "thread-1",
      ...(eveSessionId ? { eveSessionId } : {}),
      expiresAt: now + 60,
      homeScopeId: "personal:user-1",
      initialPerspective: {
        focusScopeId: "workspace-a",
        viaScopeIds: ["project-a"],
      },
      personaId: "personal-agent",
      subject,
    },
    secret,
  )
}

function request(path: string, token?: string) {
  return new Request(`http://sigil-chat-agent.localhost:1355${path}`, {
    headers: token ? { "x-sigil-session-binding": token } : undefined,
  })
}

describe("requireVerifiedEveSessionBinding", () => {
  it("returns the immutable binding for the authenticated principal", () => {
    expect(
      requireVerifiedEveSessionBinding(
        request(
          "/eve/v1/session/session-1",
          proof({ eveSessionId: "session-1" }),
        ),
        "user-1",
        secret,
        now,
      ),
    ).toMatchObject({
      applicationThreadId: "thread-1",
      homeScopeId: "personal:user-1",
      personaId: "personal-agent",
      subject: "user-1",
    })
  })

  it.each([
    ["missing proof", request("/eve/v1/session")],
    [
      "wrong principal",
      request("/eve/v1/session", proof({ subject: "user-2" })),
    ],
    ["expired proof", request("/eve/v1/session", proof()), now + 60],
  ])("rejects %s on a session route", (_label, input, at = now) => {
    expect(() =>
      requireVerifiedEveSessionBinding(input, "user-1", secret, at),
    ).toThrow(EveSessionBindingVerificationError)
  })

  it("rejects a continuation attested for another Eve session", () => {
    expect(() =>
      requireVerifiedEveSessionBinding(
        request(
          "/eve/v1/session/session-1",
          proof({ eveSessionId: "session-2" }),
        ),
        "user-1",
        secret,
        now,
      ),
    ).toThrow(EveSessionBindingVerificationError)
  })

  it("returns the immutable binding for a cancel route attested to the same Eve session", () => {
    expect(
      requireVerifiedEveSessionBinding(
        request(
          "/eve/v1/session/session-1/cancel",
          proof({ eveSessionId: "session-1" }),
        ),
        "user-1",
        secret,
        now,
      ),
    ).toMatchObject({
      eveSessionId: "session-1",
      personaId: "personal-agent",
      subject: "user-1",
    })
  })

  it("rejects a create-style proof on a cancel route", () => {
    expect(() =>
      requireVerifiedEveSessionBinding(
        request("/eve/v1/session/session-1/cancel", proof()),
        "user-1",
        secret,
        now,
      ),
    ).toThrow(EveSessionBindingVerificationError)
  })

  it("rejects a cancel route attested for another Eve session", () => {
    expect(() =>
      requireVerifiedEveSessionBinding(
        request(
          "/eve/v1/session/session-1/cancel",
          proof({ eveSessionId: "session-2" }),
        ),
        "user-1",
        secret,
        now,
      ),
    ).toThrow(EveSessionBindingVerificationError)
  })

  it("rejects an existing-session proof on the create route", () => {
    expect(() =>
      requireVerifiedEveSessionBinding(
        request("/eve/v1/session", proof({ eveSessionId: "session-1" })),
        "user-1",
        secret,
        now,
      ),
    ).toThrow(EveSessionBindingVerificationError)
  })

  it("accepts a participant-channel create proof when the pending Eve id is channel-local only", () => {
    const token = issueAgentSessionBinding(
      {
        additionalContextScopeIds: ["workspace-b"],
        applicationThreadId: "thread-2",
        channel: {
          channelId: "agent-channel:thread-1+thread-2",
          ownerPrincipalId: "user-1",
          participants: [
            {
              kind: "human",
              participantId: "owner:user-1",
              principalId: "user-1",
              role: "owner",
            },
            {
              kind: "persona-session",
              applicationThreadId: "thread-1",
              eveSessionId: "session-1",
              participantId: "persona:thread-1",
              personaId: "personal-agent",
              principalId: "user-1",
              role: "participant",
              state: "dormant",
            },
            {
              kind: "persona-session",
              applicationThreadId: "thread-2",
              eveSessionId: "__pending__",
              participantId: "persona:thread-2",
              personaId: "critic-agent",
              principalId: "user-1",
              role: "participant",
              state: "active",
            },
          ],
        },
        expiresAt: now + 60,
        homeScopeId: "personal:user-1",
        initialPerspective: {
          focusScopeId: "workspace-a",
          viaScopeIds: ["project-a"],
        },
        personaId: "critic-agent",
        subject: "user-1",
      },
      secret,
    )

    expect(
      requireVerifiedEveSessionBinding(
        request("/eve/v1/session", token),
        "user-1",
        secret,
        now,
      ),
    ).toMatchObject({
      applicationThreadId: "thread-2",
      channel: {
        channelId: "agent-channel:thread-1+thread-2",
      },
      personaId: "critic-agent",
      subject: "user-1",
    })
  })

  it("does not require a binding on non-session routes", () => {
    expect(
      requireVerifiedEveSessionBinding(
        request("/eve/v1/info"),
        "user-1",
        undefined,
        now,
      ),
    ).toBeUndefined()
  })
})
