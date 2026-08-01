import { createHmac, timingSafeEqual } from "node:crypto";

import {
  isBoundAgentModel,
  type BoundAgentModel,
} from "./model-binding";
import {
  AGENT_SESSION_BINDING_VERSION,
  type AgentSessionBindingChannel,
  type AgentSessionBindingPayload,
  type AgentSessionBindingParticipant,
  type AgentSessionBindingPersonaParticipant,
  type AgentSessionExecutionBinding,
  type AgentSessionScopePerspective,
} from "./session-binding";

/**
 * Extra binding fields Sigil Chat signs on top of the neutral
 * `AgentSessionExecutionBinding` contract from `@zigil/agent`.
 *
 * Deliberately carried here rather than upstream: `@zigil/agent`'s own
 * `readAgentSessionExecutionBinding` reconstructs a fixed key whitelist and
 * would DROP an unknown field. This module's `readAgentSessionBinding` returns
 * the verified payload verbatim, so an application-owned field survives the
 * round trip — verified by reading both implementations, and by the
 * round-trip test in session-binding.test.ts. If a future @zigil/agent version
 * is adopted for verification, this field has to move upstream with it.
 */
/**
 * Mutable per-turn request parameters (MDL.4): reasoning level and fast mode.
 *
 * Deliberately NOT part of `model` above. `model` is session IDENTITY,
 * chosen once and immutable for the thread's life; `requestOptions` is
 * re-read from the live thread record every time this proof is minted (see
 * apps/web/src/lib/agent-session-binding.ts — "minted for every turn"), so a
 * change applies from the very next turn with no fork and no new signed
 * identity. Both fields are optional and independently absent: a thread with
 * no reasoning-capable model simply never carries this block.
 */
export interface SigilRequestOptions {
  reasoningLevel?: string;
  fastMode?: boolean;
}

export interface SigilSessionBindingExtras {
  /** Model the thread is bound to; absent means the deployment default. */
  model?: BoundAgentModel;
  /** See {@link SigilRequestOptions}. */
  requestOptions?: SigilRequestOptions;
}

export function issueAgentSessionBinding(
  input: AgentSessionExecutionBinding &
    SigilSessionBindingExtras & {
      runtimeSessionId?: string;
      expiresAt: number;
      subject: string;
    },
  secret: string,
): string {
  const payload: AgentSessionBindingPayload & SigilSessionBindingExtras = {
    ...input,
    audience: "sigil-agent-session-binding",
    version: AGENT_SESSION_BINDING_VERSION,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function readAgentSessionBinding(
  token: string,
  now: number,
  secret: string,
): (AgentSessionBindingPayload & SigilSessionBindingExtras) | undefined {
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
    ) as Partial<AgentSessionBindingPayload> & SigilSessionBindingExtras;
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
    value.version === AGENT_SESSION_BINDING_VERSION &&
    isIdentifier(value.subject) &&
    isIdentifier(value.applicationThreadId) &&
    isIdentifier(value.personaId) &&
    isIdentifier(value.homeScopeId) &&
    (value.runtimeSessionId === undefined || isIdentifier(value.runtimeSessionId)) &&
    (value.channel === undefined ||
      (isBindingChannel(value.channel) &&
        bindingSessionAppearsInChannel(value, value.channel))) &&
    isPerspective(value.initialPerspective) &&
    isIdentifierList(value.additionalContextScopeIds) &&
    ((value as SigilSessionBindingExtras).model === undefined ||
      isBoundAgentModel((value as SigilSessionBindingExtras).model)) &&
    isRequestOptions((value as SigilSessionBindingExtras).requestOptions) &&
    typeof value.expiresAt === "number" &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > now
  );
}

function isRequestOptions(value: unknown): value is SigilRequestOptions | undefined {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const { reasoningLevel, fastMode } = value as Record<string, unknown>;
  return (
    (reasoningLevel === undefined ||
      (typeof reasoningLevel === "string" && reasoningLevel.trim().length > 0)) &&
    (fastMode === undefined || typeof fastMode === "boolean")
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
    isIdentifier(value.runtimeSessionId) &&
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
    (binding.runtimeSessionId === undefined ||
      participant.runtimeSessionId === binding.runtimeSessionId)
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
