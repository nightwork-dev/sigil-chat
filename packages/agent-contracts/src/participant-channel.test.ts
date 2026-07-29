import { describe, expect, it } from "vitest";

import {
  isAgentChannelParticipant,
  isAgentParticipantDispatchReceipt,
  isAgentSessionChannel,
} from "./participant-channel";

describe("agent participant channel contract", () => {
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

  it("accepts a dispatch receipt naming dispatcher, target, and bounds", () => {
    expect(
      isAgentParticipantDispatchReceipt({
        kind: "agent.participant.dispatch",
        dispatcher: {
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
        bounds: {
          requestedAt: 100,
          deadlineAt: 140,
          maxOutputTokens: 256,
          contextScopeIds: ["workspace-a", "session-a"],
        },
      }),
    ).toBe(true);
  });
});
