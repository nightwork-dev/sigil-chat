import { createServerFn } from "@tanstack/react-start"

import { readAgentSessionBindingSecret } from "./agent-session-binding-secret.server"
import type { SigilAuthSession } from "./auth/server"

const SESSION_BINDING_LIFETIME_SECONDS = 60

interface SessionBindingReceipt {
  expiresAt: number
  proof: string
  subject: string
  threadId: string
}

const issueAgentSessionBindingFn = createServerFn({ method: "POST" })
  .validator((threadId: string) => threadId)
  .handler(async ({ data: threadId }): Promise<SessionBindingReceipt> => {
    const { getSession, requireSession } = await import("./auth/session")
    const { resolveAgentThreadExecutionBinding } =
      await import("./agent-threads.server")
    const { issueAgentSessionBinding } =
      await import("@workspace/agent-contracts/session-binding.server")
    const session = await getSession()
    const assertSession: (
      candidate: SigilAuthSession | null,
    ) => asserts candidate is SigilAuthSession = requireSession
    assertSession(session)
    const normalizedThreadId = threadId.trim()
    if (!normalizedThreadId) throw new Error("Agent thread id is required.")
    const binding = resolveAgentThreadExecutionBinding(
      session.user.id,
      normalizedThreadId,
    )
    if (binding.principalId !== session.user.id) {
      throw new Error("Agent session binding principal changed.")
    }
    const secret = readAgentSessionBindingSecret()
    const expiresAt =
      Math.floor(Date.now() / 1_000) + SESSION_BINDING_LIFETIME_SECONDS
    return {
      expiresAt,
      proof: issueAgentSessionBinding(
        {
          applicationThreadId: binding.threadId,
          personaId: binding.personaId,
          homeScopeId: binding.homeScopeId,
          initialPerspective: binding.initialPerspective,
          additionalContextScopeIds: binding.additionalContextScopeIds,
          ...(binding.eveSessionId
            ? { eveSessionId: binding.eveSessionId }
            : {}),
          subject: session.user.id,
          expiresAt,
        },
        secret,
      ),
      subject: session.user.id,
      threadId: binding.threadId,
    }
  })

/**
 * Minted for every turn so the server re-authorizes the immutable thread
 * binding before Eve sees it. The proof itself is short-lived and never
 * treated as a scope grant.
 */
export async function getAgentSessionBindingProof(
  threadId: string,
  principalId: string,
): Promise<string> {
  const receipt = await issueAgentSessionBindingFn({ data: threadId })
  if (receipt.subject !== principalId || receipt.threadId !== threadId) {
    throw new Error("Agent session binding changed during issuance.")
  }
  return receipt.proof
}
