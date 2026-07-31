import type { AgentSessionBindingChannel } from "@workspace/agent-contracts/session-binding"

export const AGENT_PARTICIPANT_PENDING_RUNTIME_SESSION_ID = "__pending__"

export interface AgentParticipantChannelThreadBinding {
  readonly threadId: string
  readonly principalId: string
  readonly personaId: string
  readonly runtimeSessionId?: string
}

export function normalizeParticipantThreadIds(
  threadIds: readonly string[],
): readonly string[] {
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const threadId of threadIds) {
    const value = threadId.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }
  return normalized
}

export function agentParticipantChannelId(
  threadIds: readonly string[],
): string {
  return `agent-channel:${normalizeParticipantThreadIds(threadIds).join("+")}`
}

export function agentParticipantOwnerParticipantId(
  principalId: string,
): string {
  return `owner:${principalId.trim()}`
}

export function agentParticipantPersonaParticipantId(
  threadId: string,
): string {
  return `persona:${threadId.trim()}`
}

export function agentParticipantRuntimeSessionId(
  _threadId: string,
  runtimeSessionId: string | undefined,
): string {
  const normalized = runtimeSessionId?.trim()
  return normalized || AGENT_PARTICIPANT_PENDING_RUNTIME_SESSION_ID
}

export function buildAgentParticipantChannel(input: {
  readonly activeThreadId?: string
  readonly principalId: string
  readonly sessionIds?: "all" | "active-only"
  readonly threads: readonly AgentParticipantChannelThreadBinding[]
}): AgentSessionBindingChannel {
  const threadIds = normalizeParticipantThreadIds(
    input.threads.map((thread) => thread.threadId),
  )
  const activeThreadId = input.activeThreadId?.trim()
  const byId = new Map(input.threads.map((thread) => [thread.threadId, thread]))
  return {
    channelId: agentParticipantChannelId(threadIds),
    ownerPrincipalId: input.principalId,
    participants: [
      {
        kind: "human",
        participantId: agentParticipantOwnerParticipantId(input.principalId),
        principalId: input.principalId,
        role: "owner",
      },
      ...threadIds.map((threadId) => {
        const thread = byId.get(threadId)
        if (!thread) {
          throw new Error(`Missing participant thread binding: ${threadId}`)
        }
        return {
          kind: "persona-session" as const,
          participantId: agentParticipantPersonaParticipantId(thread.threadId),
          principalId: input.principalId,
          personaId: thread.personaId,
          runtimeSessionId: agentParticipantRuntimeSessionId(
            thread.threadId,
            input.sessionIds === "active-only" &&
              activeThreadId !== thread.threadId
              ? undefined
              : thread.runtimeSessionId,
          ),
          applicationThreadId: thread.threadId,
          role: "participant" as const,
          state:
            activeThreadId === thread.threadId
              ? ("active" as const)
              : ("dormant" as const),
        }
      }),
    ],
  }
}
