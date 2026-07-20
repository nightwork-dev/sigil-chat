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
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) return false;
  const expectedSignature = signature(encoded, secret);
  const supplied = Buffer.from(suppliedSignature);
  const actual = Buffer.from(expectedSignature);
  if (supplied.length !== actual.length || !timingSafeEqual(supplied, actual)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<ScopeDelegationPayload>;
    return (
      payload.audience === "sigil-agent-scope" &&
      payload.version === 1 &&
      payload.subject === expected.subject &&
      payload.scope === expected.scope &&
      typeof payload.expiresAt === "number" &&
      Number.isSafeInteger(payload.expiresAt) &&
      payload.expiresAt > expected.now
    );
  } catch {
    return false;
  }
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
