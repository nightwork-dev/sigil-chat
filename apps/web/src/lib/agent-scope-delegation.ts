import { createServerFn } from "@tanstack/react-start"

import type { SigilAuthSession } from "./auth/server"

const SCOPE_PROOF_LIFETIME_SECONDS = 5 * 60

interface ScopeProofReceipt {
  expiresAt: number
  proof: string
  subject: string
}

const issueAgentScopeProof = createServerFn({ method: "POST" })
  .validator((scope: string) => scope)
  .handler(async ({ data: scope }): Promise<ScopeProofReceipt> => {
    const { getSession, requireSession } = await import("./auth/session")
    const { agentThreadRepository } = await import("./agent-threads.server")
    const { issueScopeDelegation } =
      await import("@workspace/agent-contracts/scope-delegation.server")
    const session = await getSession()
    const assertSession: (
      candidate: SigilAuthSession | null,
    ) => asserts candidate is SigilAuthSession = requireSession
    assertSession(session)
    const { assertAuthorizedScope } =
      await import("./agent-scope-authorization.server")
    assertAuthorizedScope(scope, session.user.id, (userId, threadId) =>
      Boolean(agentThreadRepository.get(userId, threadId)),
      undefined,
      undefined,
      "tool",
    )
    const secret = process.env.GONK_MCP_KEY?.trim()
    if (!secret) throw new Error("Agent scope delegation is unavailable.")
    const expiresAt =
      Math.floor(Date.now() / 1_000) + SCOPE_PROOF_LIFETIME_SECONDS
    return {
      expiresAt,
      proof: issueScopeDelegation(
        { expiresAt, scope, subject: session.user.id },
        secret,
      ),
      subject: session.user.id,
    }
  })

const proofCache = new Map<string, ScopeProofReceipt>()

export async function getAgentScopeProof(
  scope: string,
  principalId: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1_000)
  const cacheKey = `${principalId}:${scope}`
  const cached = proofCache.get(cacheKey)
  if (cached && cached.expiresAt > now + 30) return cached.proof
  const receipt = await issueAgentScopeProof({ data: scope })
  if (receipt.subject !== principalId) {
    throw new Error("Agent scope delegation principal changed.")
  }
  proofCache.set(cacheKey, receipt)
  return receipt.proof
}
