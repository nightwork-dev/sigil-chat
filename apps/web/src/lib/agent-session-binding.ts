import { createServerFn } from "@tanstack/react-start"
import type { AgentSessionBindingChannel } from "@workspace/agent-contracts/session-binding"
import { readOptionalSecretFromFile } from "@workspace/runtime-env/server"

import {
  agentParticipantPersonaParticipantId,
  buildAgentParticipantChannel,
  normalizeParticipantThreadIds,
} from "./agent-participant-channel-binding"
import type { SigilAuthSession } from "./auth/server"

const SESSION_BINDING_LIFETIME_SECONDS = 60

interface SessionBindingReceipt {
  expiresAt: number
  proof: string
  subject: string
  threadId: string
}

export interface AgentParticipantSessionBindingRequest {
  readonly participantThreadIds: readonly string[]
  readonly targetThreadId: string
}

interface ParticipantSessionBindingReceipt extends SessionBindingReceipt {
  channel: AgentSessionBindingChannel
  targetParticipantId: string
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
    const secret = readOptionalSecretFromFile(
      process.env,
      "SIGIL_AGENT_BINDING_SECRET",
    )
    if (!secret) throw new Error("Agent session binding is unavailable.")
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

const issueAgentParticipantSessionBindingFn = createServerFn({ method: "POST" })
  .validator((input: AgentParticipantSessionBindingRequest) => ({
    participantThreadIds: Array.isArray(input.participantThreadIds)
      ? input.participantThreadIds
      : [],
    targetThreadId:
      typeof input.targetThreadId === "string" ? input.targetThreadId : "",
  }))
  .handler(
    async ({
      data,
    }: {
      data: AgentParticipantSessionBindingRequest
    }): Promise<ParticipantSessionBindingReceipt> => {
      const { getSession, requireSession } = await import("./auth/session")
      const { resolveAgentThreadExecutionBinding } =
        await import("./agent-threads.server")
      const { issueAgentSessionBinding } = await import(
        "@workspace/agent-contracts/session-binding.server"
      )
      const session = await getSession()
      const assertSession: (
        candidate: SigilAuthSession | null,
      ) => asserts candidate is SigilAuthSession = requireSession
      assertSession(session)

      const participantThreadIds = normalizeParticipantThreadIds(
        data.participantThreadIds,
      )
      const targetThreadId = data.targetThreadId.trim()
      if (!targetThreadId) throw new Error("Target agent thread id is required.")
      if (!participantThreadIds.includes(targetThreadId)) {
        throw new Error("Target thread is not a member of the participant channel.")
      }

      const bindings = participantThreadIds.map((threadId) =>
        resolveAgentThreadExecutionBinding(session.user.id, threadId),
      )
      const target = bindings.find((binding) => binding.threadId === targetThreadId)
      if (!target) {
        throw new Error("Target agent thread binding could not be resolved.")
      }
      if (bindings.some((binding) => binding.principalId !== session.user.id)) {
        throw new Error("Agent channel binding principal changed.")
      }

      const channel = buildAgentParticipantChannel({
        activeThreadId: target.threadId,
        principalId: session.user.id,
        sessionIds: "active-only",
        threads: bindings,
      })
      const secret = readOptionalSecretFromFile(
        process.env,
        "SIGIL_AGENT_BINDING_SECRET",
      )
      if (!secret) throw new Error("Agent session binding is unavailable.")
      const expiresAt =
        Math.floor(Date.now() / 1_000) + SESSION_BINDING_LIFETIME_SECONDS
      return {
        channel,
        expiresAt,
        proof: issueAgentSessionBinding(
          {
            applicationThreadId: target.threadId,
            personaId: target.personaId,
            channel,
            homeScopeId: target.homeScopeId,
            initialPerspective: target.initialPerspective,
            additionalContextScopeIds: target.additionalContextScopeIds,
            ...(target.eveSessionId ? { eveSessionId: target.eveSessionId } : {}),
            subject: session.user.id,
            expiresAt,
          },
          secret,
        ),
        subject: session.user.id,
        targetParticipantId: agentParticipantPersonaParticipantId(target.threadId),
        threadId: target.threadId,
      }
    },
  )

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

/**
 * Minted per target turn for participant channels. The browser supplies only
 * thread ids; the server reconstructs owner, persona, scope, and session
 * membership from authenticated thread records before signing the proof.
 */
export async function getAgentParticipantSessionBindingProof(
  input: AgentParticipantSessionBindingRequest,
  principalId: string,
): Promise<ParticipantSessionBindingReceipt> {
  const receipt = await issueAgentParticipantSessionBindingFn({ data: input })
  if (
    receipt.subject !== principalId ||
    receipt.threadId !== input.targetThreadId.trim()
  ) {
    throw new Error("Agent participant session binding changed during issuance.")
  }
  return receipt
}
