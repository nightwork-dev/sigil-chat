# MA.1 Participant Channel Design

> Date: 2026-07-29
> Status: implementation-ready contract note
> Scope: the neutral participant-channel slice for MA.1 Phase 1a

This note records the design that sits between the ratified auth/channel
contract and the eventual MA.1 implementation. The point is simple:

- keep the existing immutable single-session binding intact;
- add a sibling neutral participant-channel contract for membership,
  provenance, and dispatch receipts; and
- keep product-specific vocabulary out of shared contracts.

The current `AgentSessionExecutionBinding` remains the per-session binding
shape. It already captures the immutable session facts that the Eve host
expects:

- one application thread;
- one persona;
- one home scope;
- one initial perspective; and
- a bounded additional-context list.

The participant-channel contract adds the broader collaboration surface that
MA.1 needs. The implemented source of truth is
`packages/agent-contracts/src/participant-channel.ts`; the sketch below shows
the intended gate shape without restating every guard:

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
  role?: "participant" | "coordinator"
  state?: "active" | "dormant"
}

interface AgentChannelParticipantProvenance {
  channelId: string
  participantId: string
  principalId: string
  kind: AgentChannelParticipant["kind"]
  role?: "owner" | "member" | "participant" | "coordinator"
  state?: "active" | "dormant"
  personaId?: string
  eveSessionId?: string
  applicationThreadId?: string
}

interface AgentParticipantTurnAttribution {
  kind: "agent.participant.turn"
  turnId: string
  origin: AgentChannelParticipantProvenance
  streamId?: string
  createdAt: number
}

interface AgentParticipantStreamAttribution {
  kind: "agent.participant.stream"
  streamId: string
  turnId: string
  origin: AgentChannelParticipantProvenance
  openedAt: number
}

interface AgentParticipantProvenanceEnvelope<Payload = unknown> {
  kind: "agent.participant.provenance-envelope"
  subject:
    | "message"
    | "tool-call"
    | "tool-result"
    | "domain-outcome"
    | "context-contribution"
  provenance: AgentChannelParticipantProvenance
  payload: Payload
  createdAt: number
  turnId?: string
  streamId?: string
}

interface AgentParticipantInterruptionRequest {
  kind: "agent.participant.interrupt"
  requester: AgentChannelParticipantProvenance
  target: AgentChannelParticipantProvenance
  requestedAt: number
  reason?: string
}

interface AgentParticipantDispatchReceipt {
  kind: "agent.participant.dispatch"
  coordinator: AgentChannelParticipantProvenance
  target: AgentChannelParticipantProvenance
  intended: {
    channelId: string
    targetParticipantId: string
    targetEveSessionId: string
    targetApplicationThreadId: string
  }
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
  attribution;
- an omitted persona-session `state` means the existing active behavior; an
  explicit `dormant` state means no inference, dispatch, or interruption target
  is valid for that participant; and
- coordinator dispatch is bounded and explicit: the receipt must identify the
  coordinator, the intended target participant, and the exact target session
  identifiers.

Why this split instead of mutating the current binding?

Because the binding and the channel are different jobs.

The binding answers, “which immutable Eve session is this?”
The channel answers, “which participants are in this collaboration surface,
and which one produced this turn, tool call, or outcome?”

That separation keeps the current single-persona flow stable while letting
MA.1 add multiple persona-bound sessions later without turning the binding
proof into a catch-all bag.

Gate invariants:

- every turn and stream has one originating participant provenance;
- every message, tool call, tool result, domain outcome, and context
  contribution can be wrapped in the same provenance envelope shape;
- interruption is participant-targeted and must be checked against the intended
  target session, so one participant's request cannot cancel another
  participant by implication;
- a dormant participant is addressable as membership/provenance, but cannot be
  inferred for, dispatched to, or interrupted; and
- dispatch receipts fail closed unless coordinator and target provenance share
  a channel, the target matches the intended participant/session fields, and
  the coordinator provenance explicitly names either the owner role or a
  coordinator persona-session role.

Domain-only vocabulary stays out of this shared contract. The shared contract
only knows about channels, participants, provenance, interruption, and bounded
dispatch.

Implementation handoff:

- keep the current `packages/agent-contracts/src/session-binding.ts` proof
  as-is;
- use the new participant-channel contract as the neutral seam for later
  channel/session routing work;
- Phase 1b should adapt the existing chat-side seams rather than introduce a
  second runtime surface:
  `apps/web/src/lib/agent-coordinator.ts`,
  `apps/web/src/components/agent-sessions.tsx`,
  `apps/web/src/components/agent/agent-chat.tsx`,
  `apps/web/src/hooks/use-app-agent-session.ts`,
  `apps/web/src/lib/agent-domain-outcomes.tsx`, and
  `apps/web/src/lib/agent-event-retention.ts`;
- Phase 1b should bridge the current generic stop path to participant-targeted
  interruption, preserving the shared surface's active-turn cancellation shape
  while proving the target participant/session before cancel;
- Phase 1b should attach participant provenance to retained events, messages,
  tool calls/results, domain outcomes, and context contributions; retained
  turn lineage already exists, while the base message/tool rendering surfaces
  do not yet carry participant attribution;
- Eve handoff points are `apps/agent/agent/channels/eve.ts` and
  `apps/agent/agent/lib/sigil-context.ts`; shared graduation points are the
  Design `packages/agent-surface/src/contracts.ts` and
  `packages/agent-eve/src/index.ts`/conformance tests;
- wire runtime/UI only after the contract proves out in tests; and
- graduate the neutral shape into the shared `@zigil/agent-*` surface when
  MA.1’s implementation branch proves it.
