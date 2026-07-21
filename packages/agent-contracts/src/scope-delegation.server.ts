import { createHmac, timingSafeEqual } from "node:crypto";

import type { ScopeDelegationPayload } from "./scope-delegation";

export function issueScopeDelegation(
  input: Omit<ScopeDelegationPayload, "audience" | "version">,
  secret: string,
): string {
  const payload: ScopeDelegationPayload = {
    audience: "sigil-agent-scope",
    expiresAt: input.expiresAt,
    scope: input.scope,
    subject: input.subject,
    version: 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyScopeDelegation(
  token: string,
  expected: { now: number; scope: string; subject: string },
  secret: string,
): boolean {
  const payload = readScopeDelegation(token, expected.now, secret);
  return (
    payload !== undefined &&
    payload.subject === expected.subject &&
    payload.scope === expected.scope
  );
}

/**
 * Verify a delegation before projecting its signed subject into another host.
 * The caller still has to authorize that subject against live policy; this
 * function deliberately validates transport integrity only.
 */
export function readScopeDelegation(
  token: string,
  now: number,
  secret: string,
): ScopeDelegationPayload | undefined {
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
    ) as Partial<ScopeDelegationPayload>;
    if (
      payload.audience === "sigil-agent-scope" &&
      payload.version === 1 &&
      typeof payload.subject === "string" &&
      payload.subject.length > 0 &&
      typeof payload.scope === "string" &&
      payload.scope.length > 0 &&
      typeof payload.expiresAt === "number" &&
      Number.isSafeInteger(payload.expiresAt) &&
      payload.expiresAt > now
    ) {
      return payload as ScopeDelegationPayload;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
