export type AgentChannelParticipantKind = "human" | "persona-session";
export type AgentChannelParticipantState = "active" | "dormant";
export type AgentChannelCoordinatorRole = "owner" | "coordinator";

export interface AgentChannelHumanParticipant {
  kind: "human";
  participantId: string;
  principalId: string;
  role: "owner" | "member";
}

export interface AgentChannelPersonaSessionParticipant {
  kind: "persona-session";
  participantId: string;
  principalId: string;
  personaId: string;
  eveSessionId: string;
  applicationThreadId: string;
  role?: "participant" | "coordinator";
  state?: AgentChannelParticipantState;
}

export type AgentChannelParticipant =
  AgentChannelHumanParticipant | AgentChannelPersonaSessionParticipant;

export interface AgentSessionChannel {
  channelId: string;
  ownerPrincipalId: string;
  participants: readonly AgentChannelParticipant[];
}

export interface AgentChannelParticipantProvenance {
  channelId: string;
  participantId: string;
  principalId: string;
  kind: AgentChannelParticipantKind;
  role?:
    | AgentChannelHumanParticipant["role"]
    | AgentChannelPersonaSessionParticipant["role"];
  state?: AgentChannelParticipantState;
  personaId?: string;
  eveSessionId?: string;
  applicationThreadId?: string;
}

export interface AgentParticipantTurnAttribution {
  kind: "agent.participant.turn";
  turnId: string;
  origin: AgentChannelParticipantProvenance;
  streamId?: string;
  createdAt: number;
}

export interface AgentParticipantStreamAttribution {
  kind: "agent.participant.stream";
  streamId: string;
  turnId: string;
  origin: AgentChannelParticipantProvenance;
  openedAt: number;
}

export type AgentParticipantEnvelopeSubject =
  | "message"
  | "tool-call"
  | "tool-result"
  | "domain-outcome"
  | "context-contribution";

export interface AgentParticipantProvenanceEnvelope<Payload = unknown> {
  kind: "agent.participant.provenance-envelope";
  subject: AgentParticipantEnvelopeSubject;
  provenance: AgentChannelParticipantProvenance;
  payload: Payload;
  createdAt: number;
  turnId?: string;
  streamId?: string;
}

export interface AgentParticipantInterruptionRequest {
  kind: "agent.participant.interrupt";
  requester: AgentChannelParticipantProvenance;
  target: AgentChannelParticipantProvenance;
  observedTurnId: string;
  requestedAt: number;
  reason?: string;
}

export interface AgentParticipantDispatchBounds {
  requestedAt: number;
  contextScopeIds?: readonly string[];
  deadlineAt?: number;
  maxOutputTokens?: number;
}

export interface AgentParticipantDispatchReceipt {
  kind: "agent.participant.dispatch";
  coordinator: AgentChannelParticipantProvenance;
  target: AgentChannelParticipantProvenance;
  intended: {
    channelId: string;
    targetParticipantId: string;
    targetEveSessionId: string;
    targetApplicationThreadId: string;
  };
  bounds: AgentParticipantDispatchBounds;
}

export function isAgentSessionChannel(
  value: unknown,
): value is AgentSessionChannel {
  if (!isRecord(value)) return false;
  if (
    !isIdentifier(value.channelId) ||
    !isIdentifier(value.ownerPrincipalId) ||
    !Array.isArray(value.participants) ||
    value.participants.length === 0 ||
    !value.participants.every(isAgentChannelParticipant)
  ) {
    return false;
  }

  const participantIds = new Set<string>();
  let hasOwnerParticipant = false;

  for (const participant of value.participants) {
    if (participantIds.has(participant.participantId)) {
      return false;
    }
    participantIds.add(participant.participantId);

    if (
      participant.kind === "human" &&
      participant.role === "owner" &&
      participant.principalId === value.ownerPrincipalId
    ) {
      hasOwnerParticipant = true;
    }

    if (participant.kind === "human" && participant.role === "owner") {
      if (participant.principalId !== value.ownerPrincipalId) {
        return false;
      }
    }
  }

  return hasOwnerParticipant;
}

export function isAgentChannelParticipant(
  value: unknown,
): value is AgentChannelParticipant {
  if (!isRecord(value) || !isIdentifier(value.participantId)) return false;
  if (!isIdentifier(value.principalId)) return false;
  if (value.kind === "human") {
    return value.role === "owner" || value.role === "member";
  }
  if (value.kind !== "persona-session") return false;
  return (
    isIdentifier(value.personaId) &&
    isIdentifier(value.eveSessionId) &&
    isIdentifier(value.applicationThreadId) &&
    (value.role === undefined ||
      value.role === "participant" ||
      value.role === "coordinator") &&
    (value.state === undefined ||
      value.state === "active" ||
      value.state === "dormant")
  );
}

export function isAgentChannelParticipantProvenance(
  value: unknown,
): value is AgentChannelParticipantProvenance {
  if (!isRecord(value)) return false;
  if (
    !isIdentifier(value.channelId) ||
    !isIdentifier(value.participantId) ||
    !isIdentifier(value.principalId)
  ) {
    return false;
  }
  if (value.kind === "human") {
    return (
      (value.role === undefined ||
        value.role === "owner" ||
        value.role === "member") &&
      value.state === undefined
    );
  }
  return (
    value.kind === "persona-session" &&
    isIdentifier(value.personaId) &&
    isIdentifier(value.eveSessionId) &&
    isIdentifier(value.applicationThreadId) &&
    (value.role === undefined ||
      value.role === "participant" ||
      value.role === "coordinator") &&
    (value.state === undefined ||
      value.state === "active" ||
      value.state === "dormant")
  );
}

export function isAgentParticipantTurnAttribution(
  value: unknown,
): value is AgentParticipantTurnAttribution {
  if (!isRecord(value) || value.kind !== "agent.participant.turn") {
    return false;
  }
  return (
    isIdentifier(value.turnId) &&
    isAgentChannelParticipantProvenance(value.origin) &&
    (value.streamId === undefined || isIdentifier(value.streamId)) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt)
  );
}

export function isAgentParticipantStreamAttribution(
  value: unknown,
): value is AgentParticipantStreamAttribution {
  if (!isRecord(value) || value.kind !== "agent.participant.stream") {
    return false;
  }
  return (
    isIdentifier(value.streamId) &&
    isIdentifier(value.turnId) &&
    isAgentChannelParticipantProvenance(value.origin) &&
    typeof value.openedAt === "number" &&
    Number.isFinite(value.openedAt)
  );
}

export function isAgentParticipantProvenanceEnvelope(
  value: unknown,
): value is AgentParticipantProvenanceEnvelope {
  if (
    !isRecord(value) ||
    value.kind !== "agent.participant.provenance-envelope"
  ) {
    return false;
  }
  return (
    isAgentParticipantEnvelopeSubject(value.subject) &&
    isAgentChannelParticipantProvenance(value.provenance) &&
    "payload" in value &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    (value.turnId === undefined || isIdentifier(value.turnId)) &&
    (value.streamId === undefined || isIdentifier(value.streamId))
  );
}

export function isAgentParticipantInterruptionRequest(
  value: unknown,
): value is AgentParticipantInterruptionRequest {
  if (!isRecord(value) || value.kind !== "agent.participant.interrupt") {
    return false;
  }
  return (
    isAgentChannelParticipantProvenance(value.requester) &&
    isAgentChannelParticipantProvenance(value.target) &&
    value.requester.channelId === value.target.channelId &&
    value.target.kind === "persona-session" &&
    value.target.state !== "dormant" &&
    isIdentifier(value.observedTurnId) &&
    typeof value.requestedAt === "number" &&
    Number.isFinite(value.requestedAt) &&
    (value.reason === undefined || typeof value.reason === "string")
  );
}

export function isAgentParticipantInterruptionRequestForTarget(
  value: unknown,
  target: AgentChannelParticipantProvenance,
): value is AgentParticipantInterruptionRequest {
  return (
    isAgentParticipantInterruptionRequest(value) &&
    sameParticipantSession(value.target, target)
  );
}

export function isAgentParticipantDispatchReceipt(
  value: unknown,
): value is AgentParticipantDispatchReceipt {
  if (!isRecord(value) || value.kind !== "agent.participant.dispatch") {
    return false;
  }
  return (
    isAgentChannelParticipantProvenance(value.coordinator) &&
    isAgentChannelParticipantProvenance(value.target) &&
    isRecord(value.intended) &&
    isIdentifier(value.intended.channelId) &&
    isIdentifier(value.intended.targetParticipantId) &&
    isIdentifier(value.intended.targetEveSessionId) &&
    isIdentifier(value.intended.targetApplicationThreadId) &&
    value.coordinator.channelId === value.target.channelId &&
    value.target.channelId === value.intended.channelId &&
    value.target.participantId === value.intended.targetParticipantId &&
    value.target.kind === "persona-session" &&
    value.target.eveSessionId === value.intended.targetEveSessionId &&
    value.target.applicationThreadId ===
      value.intended.targetApplicationThreadId &&
    isCoordinatorProvenance(value.coordinator) &&
    isAgentParticipantDispatchBounds(value.bounds)
  );
}

export function isAgentParticipantDispatchReceiptForChannel(
  value: unknown,
  channel: AgentSessionChannel,
): value is AgentParticipantDispatchReceipt {
  if (
    !isAgentSessionChannel(channel) ||
    !isAgentParticipantDispatchReceipt(value)
  ) {
    return false;
  }

  const coordinator = findParticipant(channel, value.coordinator.participantId);
  const target = findParticipant(channel, value.target.participantId);

  return (
    coordinator !== undefined &&
    target !== undefined &&
    provenanceMatchesParticipant(
      value.coordinator,
      channel.channelId,
      coordinator,
    ) &&
    provenanceMatchesParticipant(value.target, channel.channelId, target) &&
    isCoordinatorParticipant(coordinator) &&
    target.kind === "persona-session" &&
    target.eveSessionId === value.intended.targetEveSessionId &&
    target.applicationThreadId === value.intended.targetApplicationThreadId
  );
}

export function isAgentParticipantDispatchBounds(
  value: unknown,
): value is AgentParticipantDispatchBounds {
  if (!isRecord(value) || typeof value.requestedAt !== "number") {
    return false;
  }
  return (
    (value.contextScopeIds === undefined ||
      isIdentifierList(value.contextScopeIds)) &&
    (value.deadlineAt === undefined ||
      (typeof value.deadlineAt === "number" &&
        Number.isFinite(value.deadlineAt))) &&
    (value.maxOutputTokens === undefined ||
      (typeof value.maxOutputTokens === "number" &&
        Number.isSafeInteger(value.maxOutputTokens) &&
        value.maxOutputTokens >= 0))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIdentifierList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isIdentifier);
}

function isAgentParticipantEnvelopeSubject(
  value: unknown,
): value is AgentParticipantEnvelopeSubject {
  return (
    value === "message" ||
    value === "tool-call" ||
    value === "tool-result" ||
    value === "domain-outcome" ||
    value === "context-contribution"
  );
}

function isCoordinatorProvenance(
  provenance: AgentChannelParticipantProvenance,
): boolean {
  if (provenance.kind === "human") {
    return provenance.role === "owner";
  }
  return provenance.role === "coordinator";
}

function isCoordinatorParticipant(
  participant: AgentChannelParticipant,
): boolean {
  if (participant.kind === "human") return participant.role === "owner";
  return participant.role === "coordinator";
}

function findParticipant(
  channel: AgentSessionChannel,
  participantId: string,
): AgentChannelParticipant | undefined {
  return channel.participants.find(
    (participant) => participant.participantId === participantId,
  );
}

function provenanceMatchesParticipant(
  provenance: AgentChannelParticipantProvenance,
  channelId: string,
  participant: AgentChannelParticipant,
): boolean {
  if (
    provenance.channelId !== channelId ||
    provenance.kind !== participant.kind ||
    provenance.participantId !== participant.participantId ||
    provenance.principalId !== participant.principalId
  ) {
    return false;
  }

  if (participant.kind === "human") {
    return (
      provenance.role === undefined || provenance.role === participant.role
    );
  }

  return (
    provenance.personaId === participant.personaId &&
    provenance.eveSessionId === participant.eveSessionId &&
    provenance.applicationThreadId === participant.applicationThreadId &&
    (provenance.role === undefined || provenance.role === participant.role) &&
    (provenance.state === undefined ||
      participantStatesMatch(provenance.state, participant.state))
  );
}

function participantStatesMatch(
  provenanceState: AgentChannelParticipantState,
  participantState: AgentChannelParticipantState | undefined,
): boolean {
  return provenanceState === (participantState ?? "active");
}

function sameParticipantSession(
  left: AgentChannelParticipantProvenance,
  right: AgentChannelParticipantProvenance,
): boolean {
  return (
    left.channelId === right.channelId &&
    left.participantId === right.participantId &&
    left.kind === right.kind &&
    left.principalId === right.principalId &&
    left.personaId === right.personaId &&
    left.eveSessionId === right.eveSessionId &&
    left.applicationThreadId === right.applicationThreadId
  );
}
