import { describe, expect, it } from "vitest"
import {
  issueAgentSessionBinding,
  readAgentSessionBinding,
} from "@workspace/agent-contracts/session-binding.server"

import {
  AGENT_PARTICIPANT_PENDING_EVE_SESSION_ID,
  agentParticipantPersonaParticipantId,
  buildAgentParticipantChannel,
} from "./agent-participant-channel-binding"

describe("agent participant channel binding", () => {
  it("marks only the signed target active and leaves missing Eve sessions on the neutral pending sentinel", () => {
    const channel = buildAgentParticipantChannel({
      activeThreadId: "thread-b",
      principalId: "user-1",
      threads: [
        {
          threadId: "thread-a",
          principalId: "user-1",
          personaId: "agent-a",
          eveSessionId: "eve-a",
        },
        {
          threadId: "thread-b",
          principalId: "user-1",
          personaId: "agent-b",
        },
        {
          threadId: "thread-c",
          principalId: "user-1",
          personaId: "agent-c",
        },
      ],
    })

    expect(channel.channelId).toBe("agent-channel:thread-a+thread-b+thread-c")
    expect(channel.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicationThreadId: "thread-a",
          eveSessionId: "eve-a",
          participantId: agentParticipantPersonaParticipantId("thread-a"),
          state: "dormant",
        }),
        expect.objectContaining({
          applicationThreadId: "thread-b",
          eveSessionId: AGENT_PARTICIPANT_PENDING_EVE_SESSION_ID,
          participantId: agentParticipantPersonaParticipantId("thread-b"),
          state: "active",
        }),
        expect.objectContaining({
          applicationThreadId: "thread-c",
          eveSessionId: AGENT_PARTICIPANT_PENDING_EVE_SESSION_ID,
          participantId: agentParticipantPersonaParticipantId("thread-c"),
          state: "dormant",
        }),
      ]),
    )
  })

  it("round-trips a create-session target proof without a top-level Eve session id", () => {
    const channel = buildAgentParticipantChannel({
      activeThreadId: "thread-b",
      principalId: "user-1",
      threads: [
        {
          threadId: "thread-a",
          principalId: "user-1",
          personaId: "agent-a",
          eveSessionId: "eve-a",
        },
        {
          threadId: "thread-b",
          principalId: "user-1",
          personaId: "agent-b",
        },
      ],
    })

    const proof = issueAgentSessionBinding(
      {
        additionalContextScopeIds: [],
        applicationThreadId: "thread-b",
        channel,
        expiresAt: 1_750_000_060,
        homeScopeId: "personal:user-1",
        initialPerspective: {
          focusScopeId: "personal:user-1",
          viaScopeIds: [],
        },
        personaId: "agent-b",
        subject: "user-1",
      },
      "secret",
    )

    const payload = readAgentSessionBinding(proof, 1_750_000_000, "secret")
    expect(payload).toMatchObject({
        applicationThreadId: "thread-b",
        channel: {
          channelId: "agent-channel:thread-a+thread-b",
          participants: expect.arrayContaining([
            expect.objectContaining({
              applicationThreadId: "thread-b",
              eveSessionId: AGENT_PARTICIPANT_PENDING_EVE_SESSION_ID,
              state: "active",
            }),
            expect.objectContaining({
              applicationThreadId: "thread-a",
              state: "dormant",
            }),
          ]),
        },
        personaId: "agent-b",
      })
    expect(payload).not.toHaveProperty("eveSessionId")
  })

  it("round-trips a continuation target proof against that target's real Eve session id", () => {
    const channel = buildAgentParticipantChannel({
      activeThreadId: "thread-b",
      principalId: "user-1",
      threads: [
        {
          threadId: "thread-a",
          principalId: "user-1",
          personaId: "agent-a",
          eveSessionId: "eve-a",
        },
        {
          threadId: "thread-b",
          principalId: "user-1",
          personaId: "agent-b",
          eveSessionId: "eve-b",
        },
      ],
    })

    const proof = issueAgentSessionBinding(
      {
        additionalContextScopeIds: [],
        applicationThreadId: "thread-b",
        channel,
        eveSessionId: "eve-b",
        expiresAt: 1_750_000_060,
        homeScopeId: "personal:user-1",
        initialPerspective: {
          focusScopeId: "personal:user-1",
          viaScopeIds: [],
        },
        personaId: "agent-b",
        subject: "user-1",
      },
      "secret",
    )

    expect(readAgentSessionBinding(proof, 1_750_000_000, "secret")).toMatchObject(
      {
        applicationThreadId: "thread-b",
        eveSessionId: "eve-b",
        personaId: "agent-b",
      },
    )
  })

  it("keeps each target's signed channel projection stable as peer sessions wake", () => {
    const aWhileBPending = buildAgentParticipantChannel({
      activeThreadId: "thread-a",
      principalId: "user-1",
      sessionIds: "active-only",
      threads: [
        {
          threadId: "thread-a",
          principalId: "user-1",
          personaId: "agent-a",
          eveSessionId: "eve-a",
        },
        {
          threadId: "thread-b",
          principalId: "user-1",
          personaId: "agent-b",
        },
      ],
    })
    const aAfterBWakes = buildAgentParticipantChannel({
      activeThreadId: "thread-a",
      principalId: "user-1",
      sessionIds: "active-only",
      threads: [
        {
          threadId: "thread-a",
          principalId: "user-1",
          personaId: "agent-a",
          eveSessionId: "eve-a",
        },
        {
          threadId: "thread-b",
          principalId: "user-1",
          personaId: "agent-b",
          eveSessionId: "eve-b",
        },
      ],
    })
    const bAfterBothWake = buildAgentParticipantChannel({
      activeThreadId: "thread-b",
      principalId: "user-1",
      sessionIds: "active-only",
      threads: [
        {
          threadId: "thread-a",
          principalId: "user-1",
          personaId: "agent-a",
          eveSessionId: "eve-a",
        },
        {
          threadId: "thread-b",
          principalId: "user-1",
          personaId: "agent-b",
          eveSessionId: "eve-b",
        },
      ],
    })

    expect(aAfterBWakes).toEqual(aWhileBPending)
    expect(aAfterBWakes.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicationThreadId: "thread-a",
          eveSessionId: "eve-a",
          state: "active",
        }),
        expect.objectContaining({
          applicationThreadId: "thread-b",
          eveSessionId: AGENT_PARTICIPANT_PENDING_EVE_SESSION_ID,
          state: "dormant",
        }),
      ]),
    )
    expect(bAfterBothWake.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicationThreadId: "thread-a",
          eveSessionId: AGENT_PARTICIPANT_PENDING_EVE_SESSION_ID,
          state: "dormant",
        }),
        expect.objectContaining({
          applicationThreadId: "thread-b",
          eveSessionId: "eve-b",
          state: "active",
        }),
      ]),
    )
  })
})
