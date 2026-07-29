import { describe, expect, it } from "vitest";

import {
  isAgentChannelParticipant,
  isAgentParticipantDispatchReceiptForChannel,
  isAgentParticipantInterruptionRequest,
  isAgentParticipantInterruptionRequestForTarget,
  isAgentParticipantProvenanceEnvelope,
  isAgentParticipantDispatchReceipt,
  isAgentParticipantStreamAttribution,
  isAgentParticipantTurnAttribution,
  isAgentSessionChannel,
} from "./participant-channel";

describe("agent participant channel contract", () => {
  const channel = {
    channelId: "channel-a",
    ownerPrincipalId: "user-a",
    participants: [
      {
        kind: "human",
        participantId: "participant-human-a",
        principalId: "user-a",
        role: "owner",
      },
      {
        kind: "human",
        participantId: "participant-human-b",
        principalId: "user-b",
        role: "member",
      },
      {
        kind: "persona-session",
        participantId: "participant-eve-a",
        principalId: "user-a",
        personaId: "persona-a",
        eveSessionId: "eve-session-a",
        applicationThreadId: "thread-a",
      },
      {
        kind: "persona-session",
        participantId: "participant-coordinator-a",
        principalId: "user-a",
        personaId: "persona-coordinator-a",
        eveSessionId: "eve-session-coordinator-a",
        applicationThreadId: "thread-coordinator-a",
        role: "coordinator",
      },
      {
        kind: "persona-session",
        participantId: "participant-eve-dormant-a",
        principalId: "user-a",
        personaId: "persona-dormant-a",
        eveSessionId: "eve-session-dormant-a",
        applicationThreadId: "thread-dormant-a",
        state: "dormant",
      },
    ],
  } as const;

  it("accepts a single-owner channel with one persona session", () => {
    expect(
      isAgentSessionChannel({
        channelId: "channel-a",
        ownerPrincipalId: "user-a",
        participants: [
          {
            kind: "human",
            participantId: "participant-human-a",
            principalId: "user-a",
            role: "owner",
          },
          {
            kind: "persona-session",
            participantId: "participant-eve-a",
            principalId: "user-a",
            personaId: "persona-a",
            eveSessionId: "eve-session-a",
            applicationThreadId: "thread-a",
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts multiple persona sessions in one channel", () => {
    const channel = {
      channelId: "channel-b",
      ownerPrincipalId: "user-a",
      participants: [
        {
          kind: "human",
          participantId: "participant-human-a",
          principalId: "user-a",
          role: "owner",
        },
        {
          kind: "persona-session",
          participantId: "participant-eve-a",
          principalId: "user-a",
          personaId: "persona-a",
          eveSessionId: "eve-session-a",
          applicationThreadId: "thread-a",
        },
        {
          kind: "persona-session",
          participantId: "participant-eve-b",
          principalId: "user-a",
          personaId: "persona-b",
          eveSessionId: "eve-session-b",
          applicationThreadId: "thread-b",
        },
      ],
    } as const;

    expect(isAgentSessionChannel(channel)).toBe(true);
    expect(channel.participants.every(isAgentChannelParticipant)).toBe(true);
  });

  it("rejects a channel without the owner participant", () => {
    expect(
      isAgentSessionChannel({
        channelId: "channel-c",
        ownerPrincipalId: "user-a",
        participants: [
          {
            kind: "human",
            participantId: "participant-human-b",
            principalId: "user-b",
            role: "member",
          },
          {
            kind: "persona-session",
            participantId: "participant-eve-a",
            principalId: "user-a",
            personaId: "persona-a",
            eveSessionId: "eve-session-a",
            applicationThreadId: "thread-a",
          },
        ],
      }),
    ).toBe(false);
  });

  it("rejects a channel whose owner participant principal does not match", () => {
    expect(
      isAgentSessionChannel({
        channelId: "channel-d",
        ownerPrincipalId: "user-a",
        participants: [
          {
            kind: "human",
            participantId: "participant-human-a",
            principalId: "user-b",
            role: "owner",
          },
          {
            kind: "persona-session",
            participantId: "participant-eve-a",
            principalId: "user-b",
            personaId: "persona-a",
            eveSessionId: "eve-session-a",
            applicationThreadId: "thread-a",
          },
        ],
      }),
    ).toBe(false);
  });

  it("rejects duplicate participant ids", () => {
    expect(
      isAgentSessionChannel({
        channelId: "channel-e",
        ownerPrincipalId: "user-a",
        participants: [
          {
            kind: "human",
            participantId: "participant-human-a",
            principalId: "user-a",
            role: "owner",
          },
          {
            kind: "persona-session",
            participantId: "participant-human-a",
            principalId: "user-a",
            personaId: "persona-a",
            eveSessionId: "eve-session-a",
            applicationThreadId: "thread-a",
          },
        ],
      }),
    ).toBe(false);
  });

  it("rejects incomplete participant provenance", () => {
    expect(
      isAgentChannelParticipant({
        kind: "persona-session",
        participantId: "participant-eve-a",
        principalId: "user-a",
        personaId: "persona-a",
        applicationThreadId: "thread-a",
      }),
    ).toBe(false);
  });

  it("accepts turn and stream attribution for the originating participant", () => {
    const origin = {
      channelId: "channel-a",
      participantId: "participant-eve-a",
      principalId: "user-a",
      kind: "persona-session",
      personaId: "persona-a",
      eveSessionId: "eve-session-a",
      applicationThreadId: "thread-a",
    } as const;

    expect(
      isAgentParticipantTurnAttribution({
        kind: "agent.participant.turn",
        turnId: "turn-a",
        streamId: "stream-a",
        origin,
        createdAt: 100,
      }),
    ).toBe(true);
    expect(
      isAgentParticipantStreamAttribution({
        kind: "agent.participant.stream",
        streamId: "stream-a",
        turnId: "turn-a",
        origin,
        openedAt: 101,
      }),
    ).toBe(true);
  });

  it("wraps messages, tools, outcomes, and context contributions with provenance", () => {
    const provenance = {
      channelId: "channel-a",
      participantId: "participant-eve-a",
      principalId: "user-a",
      kind: "persona-session",
      personaId: "persona-a",
      eveSessionId: "eve-session-a",
      applicationThreadId: "thread-a",
    } as const;

    for (const subject of [
      "message",
      "tool-call",
      "tool-result",
      "domain-outcome",
      "context-contribution",
    ] as const) {
      expect(
        isAgentParticipantProvenanceEnvelope({
          kind: "agent.participant.provenance-envelope",
          subject,
          provenance,
          payload: { id: `${subject}-a` },
          createdAt: 100,
          turnId: "turn-a",
          streamId: "stream-a",
        }),
      ).toBe(true);
    }
  });

  it("rejects an envelope without a recognized neutral subject", () => {
    expect(
      isAgentParticipantProvenanceEnvelope({
        kind: "agent.participant.provenance-envelope",
        subject: "domain-specific-event",
        provenance: {
          channelId: "channel-a",
          participantId: "participant-eve-a",
          principalId: "user-a",
          kind: "persona-session",
          personaId: "persona-a",
          eveSessionId: "eve-session-a",
          applicationThreadId: "thread-a",
        },
        payload: { id: "message-a" },
        createdAt: 100,
      }),
    ).toBe(false);
  });

  it("accepts participant-targeted interruption for the intended active session", () => {
    const target = {
      channelId: "channel-a",
      participantId: "participant-eve-a",
      principalId: "user-a",
      kind: "persona-session",
      personaId: "persona-a",
      eveSessionId: "eve-session-a",
      applicationThreadId: "thread-a",
    } as const;
    const request = {
      kind: "agent.participant.interrupt",
      requester: {
        channelId: "channel-a",
        participantId: "participant-human-a",
        principalId: "user-a",
        kind: "human",
        role: "owner",
      },
      target,
      observedTurnId: "turn-a",
      requestedAt: 100,
    } as const;

    expect(isAgentParticipantInterruptionRequest(request)).toBe(true);
    expect(
      isAgentParticipantInterruptionRequestForTarget(request, target),
    ).toBe(true);
  });

  it("rejects interruption when checked against another participant target", () => {
    const request = {
      kind: "agent.participant.interrupt",
      requester: {
        channelId: "channel-a",
        participantId: "participant-human-a",
        principalId: "user-a",
        kind: "human",
        role: "owner",
      },
      target: {
        channelId: "channel-a",
        participantId: "participant-eve-a",
        principalId: "user-a",
        kind: "persona-session",
        personaId: "persona-a",
        eveSessionId: "eve-session-a",
        applicationThreadId: "thread-a",
      },
      observedTurnId: "turn-a",
      requestedAt: 100,
    } as const;

    expect(
      isAgentParticipantInterruptionRequestForTarget(request, {
        channelId: "channel-a",
        participantId: "participant-eve-b",
        principalId: "user-a",
        kind: "persona-session",
        personaId: "persona-b",
        eveSessionId: "eve-session-b",
        applicationThreadId: "thread-b",
      }),
    ).toBe(false);
  });

  it("rejects interruption without the currently observed active turn", () => {
    expect(
      isAgentParticipantInterruptionRequest({
        kind: "agent.participant.interrupt",
        requester: {
          channelId: "channel-a",
          participantId: "participant-human-a",
          principalId: "user-a",
          kind: "human",
          role: "owner",
        },
        target: {
          channelId: "channel-a",
          participantId: "participant-eve-a",
          principalId: "user-a",
          kind: "persona-session",
          personaId: "persona-a",
          eveSessionId: "eve-session-a",
          applicationThreadId: "thread-a",
        },
        requestedAt: 100,
      }),
    ).toBe(false);
  });

  it("rejects interruption targeting a dormant participant", () => {
    expect(
      isAgentParticipantInterruptionRequest({
        kind: "agent.participant.interrupt",
        requester: {
          channelId: "channel-a",
          participantId: "participant-human-a",
          principalId: "user-a",
          kind: "human",
          role: "owner",
        },
        target: {
          channelId: "channel-a",
          participantId: "participant-eve-dormant-a",
          principalId: "user-a",
          kind: "persona-session",
          personaId: "persona-dormant-a",
          eveSessionId: "eve-session-dormant-a",
          applicationThreadId: "thread-dormant-a",
          state: "dormant",
        },
        observedTurnId: "turn-dormant-a",
        requestedAt: 100,
      }),
    ).toBe(false);
  });

  it("accepts a dispatch receipt naming coordinator, target, and bounds", () => {
    const receipt = {
      kind: "agent.participant.dispatch",
      coordinator: {
        channelId: "channel-a",
        participantId: "participant-human-a",
        principalId: "user-a",
        kind: "human",
        role: "owner",
      },
      target: {
        channelId: "channel-a",
        participantId: "participant-eve-a",
        principalId: "user-a",
        kind: "persona-session",
        personaId: "persona-a",
        eveSessionId: "eve-session-a",
        applicationThreadId: "thread-a",
      },
      intended: {
        channelId: "channel-a",
        targetParticipantId: "participant-eve-a",
        targetEveSessionId: "eve-session-a",
        targetApplicationThreadId: "thread-a",
      },
      bounds: {
        requestedAt: 100,
        deadlineAt: 140,
        maxOutputTokens: 256,
        contextScopeIds: ["workspace-a", "session-a"],
      },
    } as const;

    expect(isAgentParticipantDispatchReceipt(receipt)).toBe(true);
    expect(isAgentParticipantDispatchReceiptForChannel(receipt, channel)).toBe(
      true,
    );
  });

  it("accepts bounded dispatch from a coordinator persona", () => {
    expect(
      isAgentParticipantDispatchReceiptForChannel(
        {
          kind: "agent.participant.dispatch",
          coordinator: {
            channelId: "channel-a",
            participantId: "participant-coordinator-a",
            principalId: "user-a",
            kind: "persona-session",
            personaId: "persona-coordinator-a",
            eveSessionId: "eve-session-coordinator-a",
            applicationThreadId: "thread-coordinator-a",
            role: "coordinator",
          },
          target: {
            channelId: "channel-a",
            participantId: "participant-eve-a",
            principalId: "user-a",
            kind: "persona-session",
            personaId: "persona-a",
            eveSessionId: "eve-session-a",
            applicationThreadId: "thread-a",
          },
          intended: {
            channelId: "channel-a",
            targetParticipantId: "participant-eve-a",
            targetEveSessionId: "eve-session-a",
            targetApplicationThreadId: "thread-a",
          },
          bounds: {
            requestedAt: 100,
            maxOutputTokens: 256,
          },
        },
        channel,
      ),
    ).toBe(true);
  });

  it("rejects dispatch receipts whose coordinator and target cross channels", () => {
    expect(
      isAgentParticipantDispatchReceipt({
        kind: "agent.participant.dispatch",
        coordinator: {
          channelId: "channel-a",
          participantId: "participant-human-a",
          principalId: "user-a",
          kind: "human",
          role: "owner",
        },
        target: {
          channelId: "channel-b",
          participantId: "participant-eve-a",
          principalId: "user-a",
          kind: "persona-session",
          personaId: "persona-a",
          eveSessionId: "eve-session-a",
          applicationThreadId: "thread-a",
        },
        intended: {
          channelId: "channel-b",
          targetParticipantId: "participant-eve-a",
          targetEveSessionId: "eve-session-a",
          targetApplicationThreadId: "thread-a",
        },
        bounds: {
          requestedAt: 100,
        },
      }),
    ).toBe(false);
  });

  it("rejects dispatch receipts with the wrong intended target session", () => {
    expect(
      isAgentParticipantDispatchReceipt({
        kind: "agent.participant.dispatch",
        coordinator: {
          channelId: "channel-a",
          participantId: "participant-human-a",
          principalId: "user-a",
          kind: "human",
          role: "owner",
        },
        target: {
          channelId: "channel-a",
          participantId: "participant-eve-a",
          principalId: "user-a",
          kind: "persona-session",
          personaId: "persona-a",
          eveSessionId: "eve-session-a",
          applicationThreadId: "thread-a",
        },
        intended: {
          channelId: "channel-a",
          targetParticipantId: "participant-eve-a",
          targetEveSessionId: "eve-session-other",
          targetApplicationThreadId: "thread-a",
        },
        bounds: {
          requestedAt: 100,
        },
      }),
    ).toBe(false);
  });

  it("rejects dispatch receipts from non-coordinator members", () => {
    expect(
      isAgentParticipantDispatchReceiptForChannel(
        {
          kind: "agent.participant.dispatch",
          coordinator: {
            channelId: "channel-a",
            participantId: "participant-human-b",
            principalId: "user-b",
            kind: "human",
            role: "member",
          },
          target: {
            channelId: "channel-a",
            participantId: "participant-eve-a",
            principalId: "user-a",
            kind: "persona-session",
            personaId: "persona-a",
            eveSessionId: "eve-session-a",
            applicationThreadId: "thread-a",
          },
          intended: {
            channelId: "channel-a",
            targetParticipantId: "participant-eve-a",
            targetEveSessionId: "eve-session-a",
            targetApplicationThreadId: "thread-a",
          },
          bounds: {
            requestedAt: 100,
          },
        },
        channel,
      ),
    ).toBe(false);
  });

  it("rejects malformed dispatch receipts", () => {
    expect(
      isAgentParticipantDispatchReceipt({
        kind: "agent.participant.dispatch",
        coordinator: {
          channelId: "channel-a",
          participantId: "participant-human-a",
          principalId: "user-a",
          kind: "human",
          role: "owner",
        },
        target: {
          channelId: "channel-a",
          participantId: "participant-eve-a",
          principalId: "user-a",
          kind: "persona-session",
          personaId: "persona-a",
          eveSessionId: "eve-session-a",
          applicationThreadId: "thread-a",
        },
        bounds: {
          requestedAt: 100,
        },
      }),
    ).toBe(false);
  });

  it("rejects dispatch receipts without explicit coordinator role provenance", () => {
    expect(
      isAgentParticipantDispatchReceipt({
        kind: "agent.participant.dispatch",
        coordinator: {
          channelId: "channel-a",
          participantId: "participant-human-a",
          principalId: "user-a",
          kind: "human",
        },
        target: {
          channelId: "channel-a",
          participantId: "participant-eve-a",
          principalId: "user-a",
          kind: "persona-session",
          personaId: "persona-a",
          eveSessionId: "eve-session-a",
          applicationThreadId: "thread-a",
        },
        intended: {
          channelId: "channel-a",
          targetParticipantId: "participant-eve-a",
          targetEveSessionId: "eve-session-a",
          targetApplicationThreadId: "thread-a",
        },
        bounds: {
          requestedAt: 100,
        },
      }),
    ).toBe(false);
  });

  it("rejects explicit dispatch receipts targeting dormant participants", () => {
    expect(
      isAgentParticipantDispatchReceiptForChannel(
        {
          kind: "agent.participant.dispatch",
          coordinator: {
            channelId: "channel-a",
            participantId: "participant-human-a",
            principalId: "user-a",
            kind: "human",
            role: "owner",
          },
          target: {
            channelId: "channel-a",
            participantId: "participant-eve-dormant-a",
            principalId: "user-a",
            kind: "persona-session",
            personaId: "persona-dormant-a",
            eveSessionId: "eve-session-dormant-a",
            applicationThreadId: "thread-dormant-a",
            state: "dormant",
          },
          intended: {
            channelId: "channel-a",
            targetParticipantId: "participant-eve-dormant-a",
            targetEveSessionId: "eve-session-dormant-a",
            targetApplicationThreadId: "thread-dormant-a",
          },
          bounds: {
            requestedAt: 100,
          },
        },
        channel,
      ),
    ).toBe(false);
  });
});
