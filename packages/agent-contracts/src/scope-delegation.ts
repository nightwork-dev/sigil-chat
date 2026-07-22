export const AGENT_SCOPE_PROOF_HEADER = "x-sigil-scope-proof";

export interface ScopeDelegationPayload {
  actorSessionId?: string;
  audience: "sigil-agent-scope";
  expiresAt: number;
  scope: string;
  subject: string;
  version: 1;
}
