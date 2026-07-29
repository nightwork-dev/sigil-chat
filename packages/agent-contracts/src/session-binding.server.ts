import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  AgentSessionBindingChannel,
  AgentSessionBindingPayload,
  AgentSessionBindingParticipant,
  AgentSessionBindingPersonaParticipant,
  AgentSessionExecutionBinding,
  AgentSessionScopePerspective,
} from "./session-binding";

export function issueAgentSessionBinding(
  input: AgentSessionExecutionBinding & {
    eveSessionId?: string;
    expiresAt: number;
    subject: string;
  },
  secret: string,
): string {
  const payload: AgentSessionBindingPayload = {
    ...input,
    audience: "sigil-agent-session-binding",
    version: 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function readAgentSessionBinding(
  token: string,
  now: number,
  secret: string,
): AgentSessionBindingPayload | undefined {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) return undefined;
  const expectedSignature = signature(encoded, secret);
  const supplied = Buffer.from(suppliedSignature);
  const actual = Buffer.from(expectedSignature);
  if (supplied.length !== actual.length || !timingSafeEqual(supplied, actual)) {
    return undefined;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<AgentSessionBindingPayload>;
    return isPayload(payload, now) ? payload : undefined;
  } catch {
    return undefined;
  }
}

function isPayload(
  value: Partial<AgentSessionBindingPayload>,
  now: number,
): value is AgentSessionBindingPayload {
  return (
    value.audience === "sigil-agent-session-binding" &&
    value.version === 1 &&
    isIdentifier(value.subject) &&
    isIdentifier(value.applicationThreadId) &&
    isIdentifier(value.personaId) &&
    isIdentifier(value.homeScopeId) &&
    (value.eveSessionId === undefined || isIdentifier(value.eveSessionId)) &&
    (value.channel === undefined ||
      (isBindingChannel(value.channel) &&
        bindingSessionAppearsInChannel(value, value.channel))) &&
    isPerspective(value.initialPerspective) &&
    isIdentifierList(value.additionalContextScopeIds) &&
    typeof value.expiresAt === "number" &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > now
  );
}

function isPerspective(value: unknown): value is AgentSessionScopePerspective {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const perspective = value as Record<string, unknown>;
  return (
    isIdentifier(perspective.focusScopeId) &&
    isIdentifierList(perspective.viaScopeIds)
  );
}

function isBindingChannel(value: unknown): value is AgentSessionBindingChannel {
  if (!isRecord(value)) return false;
  if (
    !isIdentifier(value.channelId) ||
    !isIdentifier(value.ownerPrincipalId) ||
    !Array.isArray(value.participants) ||
    value.participants.length === 0 ||
    !value.participants.every(isBindingParticipant)
  ) {
    return false;
  }

  const participantIds = new Set<string>();
  let hasOwnerParticipant = false;

  for (const participant of value.participants) {
    if (participantIds.has(participant.participantId)) return false;
    participantIds.add(participant.participantId);

    if (
      participant.kind === "human" &&
      participant.role === "owner" &&
      participant.principalId === value.ownerPrincipalId
    ) {
      hasOwnerParticipant = true;
    }

    if (
      participant.kind === "human" &&
      participant.role === "owner" &&
      participant.principalId !== value.ownerPrincipalId
    ) {
      return false;
    }
  }

  return hasOwnerParticipant;
}

function isBindingParticipant(
  value: unknown,
): value is AgentSessionBindingParticipant {
  if (!isRecord(value) || !isIdentifier(value.participantId)) return false;
  if (!isIdentifier(value.principalId)) return false;
  if (value.kind === "human") {
    return value.role === "owner" || value.role === "member";
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

function bindingSessionAppearsInChannel(
  binding: Partial<AgentSessionBindingPayload>,
  channel: AgentSessionBindingChannel,
): boolean {
  return channel.participants.some((participant) => {
    if (participant.kind !== "persona-session") return false;
    return personaParticipantMatchesBinding(participant, binding);
  });
}

function personaParticipantMatchesBinding(
  participant: AgentSessionBindingPersonaParticipant,
  binding: Partial<AgentSessionBindingPayload>,
): boolean {
  return (
    participant.personaId === binding.personaId &&
    participant.applicationThreadId === binding.applicationThreadId &&
    (binding.eveSessionId === undefined ||
      participant.eveSessionId === binding.eveSessionId)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIdentifierList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isIdentifier);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
