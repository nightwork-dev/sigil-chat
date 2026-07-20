import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import { verifyScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"

export function requireAuthorizedResourceScope(input: {
  principalId: string
  request: Request
  secret: string | undefined
}): string | undefined {
  const scope = input.request.headers.get("x-sigil-scope")?.trim()
  if (!scope) return undefined
  const proof = input.request.headers.get(AGENT_SCOPE_PROOF_HEADER)?.trim()
  const secret = input.secret?.trim()
  if (
    !proof ||
    !secret ||
    !verifyScopeDelegation(
      proof,
      {
        now: Math.floor(Date.now() / 1_000),
        scope,
        subject: input.principalId,
      },
      secret,
    )
  ) {
    throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
  }
  return scope
}
