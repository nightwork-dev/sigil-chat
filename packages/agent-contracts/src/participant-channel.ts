export type AgentChannelParticipantKind = "human" | "persona-session";

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
}

export type AgentChannelParticipant =
  | AgentChannelHumanParticipant
  | AgentChannelPersonaSessionParticipant;

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
  personaId?: string;
  eveSessionId?: string;
  applicationThreadId?: string;
}

export interface AgentParticipantDispatchBounds {
  requestedAt: number;
  contextScopeIds?: readonly string[];
  deadlineAt?: number;
  maxOutputTokens?: number;
}

export interface AgentParticipantDispatchReceipt {
  kind: "agent.participant.dispatch";
  dispatcher: AgentChannelParticipantProvenance;
  target: AgentChannelParticipantProvenance;
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
    isIdentifier(value.applicationThreadId)
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
  if (value.kind === "human") return true;
  return (
    value.kind === "persona-session" &&
    isIdentifier(value.personaId) &&
    isIdentifier(value.eveSessionId) &&
    isIdentifier(value.applicationThreadId)
  );
}

export function isAgentParticipantDispatchReceipt(
  value: unknown,
): value is AgentParticipantDispatchReceipt {
  if (!isRecord(value) || value.kind !== "agent.participant.dispatch") {
    return false;
  }
  return (
    isAgentChannelParticipantProvenance(value.dispatcher) &&
    isAgentChannelParticipantProvenance(value.target) &&
    isAgentParticipantDispatchBounds(value.bounds)
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
