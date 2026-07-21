import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  AgentSessionBindingPayload,
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

function isIdentifierList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isIdentifier);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
