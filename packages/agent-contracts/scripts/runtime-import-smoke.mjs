import assert from "node:assert/strict";

const [
  clientCommand,
  contextReceipt,
  participantChannel,
  sessionBinding,
] = await Promise.all([
  import("@workspace/agent-contracts/client-command"),
  import("@workspace/agent-contracts/context-receipt"),
  import("@workspace/agent-contracts/participant-channel"),
  import("@workspace/agent-contracts/session-binding"),
]);

assert.equal(
  clientCommand.AGENT_CLIENT_COMMAND_EVENT,
  "sigil:agent-client-command",
);
assert.equal(
  typeof contextReceipt.AGENT_CONTEXT_COMPILE_RECEIPT_VERSION,
  "number",
);
assert.equal(
  sessionBinding.AGENT_SESSION_BINDING_HEADER,
  "x-sigil-session-binding",
);
assert.equal(
  participantChannel.isAgentSessionChannel({
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
        runtimeSessionId: "eve-session-a",
        applicationThreadId: "thread-a",
      },
    ],
  }),
  true,
);
