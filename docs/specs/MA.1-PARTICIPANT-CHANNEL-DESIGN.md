# MA.1 Participant Channel Design

> Date: 2026-07-29
> Status: implementation-ready contract note
> Scope: the neutral participant-channel slice for MA.1 Phase 1a

This note records the design that sits between the ratified auth/channel
contract and the eventual MA.1 implementation. The point is simple:

- keep the existing immutable single-session binding intact;
- add a sibling neutral participant-channel contract for membership,
  provenance, and dispatch receipts; and
- do not leak scene/actor/GM/perception vocabulary into shared contracts.

The current `AgentSessionExecutionBinding` remains the per-session binding
shape. It already captures the immutable session facts that the Eve host
expects:

- one application thread;
- one persona;
- one home scope;
- one initial perspective; and
- a bounded additional-context list.

The participant-channel contract adds the broader collaboration surface that
MA.1 needs:

```ts
interface AgentSessionChannel {
  channelId: string
  ownerPrincipalId: string
  participants: readonly AgentChannelParticipant[]
}

type AgentChannelParticipant =
  | AgentChannelHumanParticipant
  | AgentChannelPersonaSessionParticipant

interface AgentChannelHumanParticipant {
  kind: "human"
  participantId: string
  principalId: string
  role: "owner" | "member"
}

interface AgentChannelPersonaSessionParticipant {
  kind: "persona-session"
  participantId: string
  principalId: string
  personaId: string
  eveSessionId: string
  applicationThreadId: string
}

interface AgentChannelParticipantProvenance {
  channelId: string
  participantId: string
  principalId: string
  kind: AgentChannelParticipant["kind"]
  personaId?: string
  eveSessionId?: string
  applicationThreadId?: string
}

interface AgentParticipantDispatchReceipt {
  kind: "agent.participant.dispatch"
  dispatcher: AgentChannelParticipantProvenance
  target: AgentChannelParticipantProvenance
  bounds: {
    requestedAt: number
    contextScopeIds?: readonly string[]
    deadlineAt?: number
    maxOutputTokens?: number
  }
}
```

The compatibility rule is the important part:

- a single-persona thread is just the degenerate channel case;
- existing session-binding proofs stay valid;
- the new contract is additive, not a rewrite of the current binding;
- `participantId` is the stable routing anchor inside the channel, while the
  provenance object is the shared envelope for message/tool/outcome/context
  attribution.

Why this split instead of mutating the current binding?

Because the binding and the channel are different jobs.

The binding answers, “which immutable Eve session is this?”
The channel answers, “which participants are in this collaboration surface,
and which one produced this turn, tool call, or outcome?”

That separation keeps the current single-persona flow stable while letting
MA.1 add multiple persona-bound sessions later without turning the binding
proof into a catch-all bag.

What stays out of the shared contract:

- scene;
- actor;
- GM;
- referee;
- perception topology;
- consequence semantics; and
- any other game-only words.

Those belong to Sigil Game. The shared contract only knows about channels,
participants, provenance, and bounded dispatch.

Implementation handoff:

- keep the current `packages/agent-contracts/src/session-binding.ts` proof
  as-is;
- use the new participant-channel contract as the neutral seam for later
  channel/session routing work;
- wire runtime/UI only after the contract proves out in tests; and
- graduate the neutral shape into the shared `@zigil/agent-*` surface when
  MA.1’s implementation branch proves it.
