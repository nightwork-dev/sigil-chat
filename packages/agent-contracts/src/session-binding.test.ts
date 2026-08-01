import { describe, expect, it } from "vitest";

import {
  issueAgentSessionBinding,
  readAgentSessionBinding,
} from "./session-binding.server";

const secret = "test-session-binding-secret";
const binding = {
  applicationThreadId: "thread-a",
  runtimeSessionId: "eve-session-a",
  personaId: "agent-a",
  homeScopeId: "workspace-a",
  initialPerspective: {
    focusScopeId: "workspace-a",
    viaScopeIds: ["project-a"],
  },
  additionalContextScopeIds: ["workspace-b"],
  subject: "user-a",
  expiresAt: 200,
};

describe("agent session binding attestation", () => {
  it("round-trips the complete immutable execution binding", () => {
    const proof = issueAgentSessionBinding(binding, secret);
    expect(readAgentSessionBinding(proof, 100, secret)).toEqual({
      ...binding,
      audience: "sigil-agent-session-binding",
      version: 2,
    });
  });

  it("round-trips a channel binding with multiple persona-bound sessions", () => {
    const channelBinding = {
      ...binding,
      channel: {
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
            participantId: "participant-agent-a",
            principalId: "user-a",
            personaId: "agent-a",
            runtimeSessionId: "eve-session-a",
            applicationThreadId: "thread-a",
          },
          {
            kind: "persona-session",
            participantId: "participant-agent-b",
            principalId: "user-a",
            personaId: "agent-b",
            runtimeSessionId: "eve-session-b",
            applicationThreadId: "thread-b",
            state: "dormant",
          },
        ],
      },
    } as const;

    const proof = issueAgentSessionBinding(channelBinding, secret);

    expect(readAgentSessionBinding(proof, 100, secret)).toEqual({
      ...channelBinding,
      audience: "sigil-agent-session-binding",
      version: 2,
    });
  });

  it("rejects channel bindings that do not contain the bound session pair", () => {
    const proof = issueAgentSessionBinding(
      {
        ...binding,
        channel: {
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
              participantId: "participant-agent-b",
              principalId: "user-a",
              personaId: "agent-b",
              runtimeSessionId: "eve-session-b",
              applicationThreadId: "thread-b",
            },
          ],
        },
      },
      secret,
    );

    expect(readAgentSessionBinding(proof, 100, secret)).toBeUndefined();
  });

  it("rejects malformed channel bindings", () => {
    const proof = issueAgentSessionBinding(
      {
        ...binding,
        channel: {
          channelId: "channel-a",
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
              participantId: "participant-human-a",
              principalId: "user-a",
              personaId: "agent-a",
              runtimeSessionId: "eve-session-a",
              applicationThreadId: "thread-a",
            },
          ],
        },
      },
      secret,
    );

    expect(readAgentSessionBinding(proof, 100, secret)).toBeUndefined();
  });

  it("round-trips MDL.4 request options alongside the immutable model binding", () => {
    const withRequestOptions = {
      ...binding,
      model: { presetId: "codex/luna", provider: "codex", modelId: "gpt-5.6-luna" },
      requestOptions: { reasoningLevel: "high", fastMode: true },
    };
    const proof = issueAgentSessionBinding(withRequestOptions, secret);
    expect(readAgentSessionBinding(proof, 100, secret)).toEqual({
      ...withRequestOptions,
      audience: "sigil-agent-session-binding",
      version: 2,
    });
  });

  it("round-trips an absent requestOptions block as ordinary, not malformed", () => {
    const proof = issueAgentSessionBinding(binding, secret);
    expect(readAgentSessionBinding(proof, 100, secret)?.requestOptions).toBeUndefined();
  });

  it("rejects a malformed requestOptions block", () => {
    const proof = issueAgentSessionBinding(
      { ...binding, requestOptions: { reasoningLevel: "", fastMode: "yes" } } as never,
      secret,
    );
    expect(readAgentSessionBinding(proof, 100, secret)).toBeUndefined();
  });

  it("rejects tampering, the wrong secret, and expiry", () => {
    const proof = issueAgentSessionBinding(binding, secret);
    expect(readAgentSessionBinding(`${proof}x`, 100, secret)).toBeUndefined();
    expect(readAgentSessionBinding(proof, 100, "wrong-secret")).toBeUndefined();
    expect(readAgentSessionBinding(proof, 200, secret)).toBeUndefined();
  });
});
