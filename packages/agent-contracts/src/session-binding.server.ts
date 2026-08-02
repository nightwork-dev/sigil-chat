import { createHmac, timingSafeEqual } from "node:crypto";

import {
  AGENT_SESSION_BINDING_VERSION,
  readAgentSessionBindingPayload,
  type AgentSessionBindingPayload,
  type AgentSessionExecutionBinding,
} from "@zigil/agent/session-binding";

export type {
  BoundAgentModel,
  SigilRequestOptions,
  SigilSessionBindingExtras,
} from "@zigil/agent/session-binding";

/**
 * Signs the immutable execution binding (now including the SDK's
 * `model`/`requestOptions` extras — see `@zigil/agent/session-binding`) into
 * a short-lived HMAC-attested proof. Structural validation of the payload
 * lives in `readAgentSessionBindingPayload` upstream; this module owns only
 * the signature envelope.
 */
export function issueAgentSessionBinding(
  input: AgentSessionExecutionBinding & {
    runtimeSessionId?: string;
    expiresAt: number;
    subject: string;
  },
  secret: string,
): string {
  const payload: AgentSessionBindingPayload = {
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
    const payload: unknown = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    return readAgentSessionBindingPayload(payload, now);
  } catch {
    return undefined;
  }
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
