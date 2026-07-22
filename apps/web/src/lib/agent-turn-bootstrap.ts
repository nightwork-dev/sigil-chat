import { createServerFn } from "@tanstack/react-start"

import type { SigilAuthSession } from "./auth/server"

const SESSION_BINDING_LIFETIME_SECONDS = 60
const SCOPE_PROOF_LIFETIME_SECONDS = 5 * 60

interface AgentTurnBootstrapInput {
  resourceScope?: string
  threadId: string
}

interface AgentTurnBootstrapReceipt {
  expiresAt: number
  scopeProof?: string
  scopeProofExpiresAt?: number
  sessionBindingProof: string
  subject: string
  threadId: string
  resourceScope?: string
}

const issueAgentTurnBootstrapFn = createServerFn({ method: "POST" })
  .validator((input: AgentTurnBootstrapInput) => input)
  .handler(
    async ({
      data: input,
    }): Promise<AgentTurnBootstrapReceipt> => {
      const { getSession, requireSession } = await import("./auth/session")
      const {
        ownedAgentThreadHomeScope,
        resolveAgentThreadExecutionBinding,
      } = await import("./agent-threads.server")
      const { assertAuthorizedScope } =
        await import("./agent-scope-authorization.server")
      const { issueScopeDelegation } =
        await import("@workspace/agent-contracts/scope-delegation.server")
      const { issueAgentSessionBinding } =
        await import("@workspace/agent-contracts/session-binding.server")

      const session = await getSession()
      const assertSession: (
        candidate: SigilAuthSession | null,
      ) => asserts candidate is SigilAuthSession = requireSession
      assertSession(session)

      const threadId = input.threadId.trim()
      if (!threadId) throw new Error("Agent thread id is required.")

      const binding = resolveAgentThreadExecutionBinding(
        session.user.id,
        threadId,
      )
      if (binding.principalId !== session.user.id) {
        throw new Error("Agent session binding principal changed.")
      }

      const secret = process.env.GONK_MCP_KEY?.trim()
      if (!secret) throw new Error("Agent turn bootstrap is unavailable.")

      const now = Math.floor(Date.now() / 1_000)
      const expiresAt = now + SESSION_BINDING_LIFETIME_SECONDS
      const resourceScope = input.resourceScope?.trim()
      const scopeProofExpiresAt = resourceScope
        ? now + SCOPE_PROOF_LIFETIME_SECONDS
        : undefined

      if (resourceScope) {
        assertAuthorizedScope(
          resourceScope,
          session.user.id,
          ownedAgentThreadHomeScope,
          undefined,
          undefined,
          "tool",
        )
      }

      return {
        expiresAt,
        sessionBindingProof: issueAgentSessionBinding(
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
        ...(resourceScope && scopeProofExpiresAt
          ? {
              resourceScope,
              scopeProof: issueScopeDelegation(
                {
                  expiresAt: scopeProofExpiresAt,
                  scope: resourceScope,
                  subject: session.user.id,
                },
                secret,
              ),
              scopeProofExpiresAt,
            }
          : {}),
      }
    },
  )

/**
 * Performs the authenticated per-turn authorization bootstrap in one server
 * function call. The session binding proof is always minted; scope delegation
 * stays optional and separate so Eve/Gonk can reject missing or stale grants
 * independently from immutable thread binding.
 */
export async function getAgentTurnBootstrap({
  principalId,
  resourceScope,
  threadId,
}: AgentTurnBootstrapInput & {
  principalId: string
}): Promise<{
  scopeProof?: string
  sessionBindingProof: string
}> {
  const normalizedThreadId = threadId.trim()
  const normalizedResourceScope = resourceScope?.trim()
  const receipt = await issueAgentTurnBootstrapFn({
    data: {
      threadId: normalizedThreadId,
      ...(normalizedResourceScope
        ? { resourceScope: normalizedResourceScope }
        : {}),
    },
  })
  if (
    receipt.subject !== principalId ||
    receipt.threadId !== normalizedThreadId
  ) {
    throw new Error("Agent turn bootstrap binding changed during issuance.")
  }
  if (
    normalizedResourceScope &&
    receipt.resourceScope !== normalizedResourceScope
  ) {
    throw new Error("Agent turn bootstrap scope changed during issuance.")
  }
  if (normalizedResourceScope && !receipt.scopeProof) {
    throw new Error("Agent turn bootstrap did not return a scope proof.")
  }
  if (!normalizedResourceScope && receipt.scopeProof) {
    throw new Error("Agent turn bootstrap returned an unexpected scope proof.")
  }
  return {
    sessionBindingProof: receipt.sessionBindingProof,
    ...(receipt.scopeProof ? { scopeProof: receipt.scopeProof } : {}),
  }
}
