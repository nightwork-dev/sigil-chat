import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type {
  AgentParticipantDispatchReceipt,
  AgentParticipantInterruptionRequest,
  AgentParticipantProvenanceEnvelope,
  AgentParticipantEnvelopeSubject,
  AgentSessionChannel,
} from "@workspace/agent-contracts/participant-channel"
import type {
  AgentRuntimeSession,
  AgentSendInput,
  AgentTurnResult,
} from "@zigil/agent/contracts"

import {
  agentParticipantRuntimeSessionId,
  agentParticipantOwnerParticipantId,
  agentParticipantPersonaParticipantId,
  buildAgentParticipantChannel,
  normalizeParticipantThreadIds,
} from "./agent-participant-channel-binding"
import { AGENT_PERSONA_HEADER, AGENT_SCOPE_HEADER } from "./agent-session-scope"
import {
  createParticipantChannelRuntime,
  type ParticipantChannelRuntime,
  type ParticipantChannelSessionPort,
} from "./agent-participant-channel-runtime"
import {
  getAgentParticipantSessionBindingProof,
  type AgentParticipantSessionBindingRequest,
} from "./agent-session-binding"
import { getAgentScopeProof } from "./agent-scope-delegation"
import type { AgentThread } from "./agent-threads"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import { AGENT_SESSION_BINDING_HEADER } from "@workspace/agent-contracts/session-binding"

export interface AgentParticipantChannelConfig {
  readonly threadIds: readonly string[]
}

export type AgentParticipantChannelEvent =
  | {
      readonly type: "participant.dispatch"
      readonly receipt: AgentParticipantDispatchReceipt
    }
  | {
      readonly type: "participant.interrupt"
      readonly request: AgentParticipantInterruptionRequest
      readonly observedTurnId: string
    }
  | {
      readonly type: "participant.envelope"
      readonly envelope: AgentParticipantProvenanceEnvelope
    }

export interface AgentParticipantChannelValue {
  readonly channel: AgentSessionChannel
  readonly events: readonly AgentParticipantChannelEvent[]
  dispatch(input: {
    readonly targetParticipantId: string
    readonly message: string
    readonly input?: Omit<AgentSendInput, "message">
  }): Promise<AgentTurnResult>
  interrupt(input: {
    readonly targetParticipantId: string
    readonly message: string
    readonly input?: Omit<AgentSendInput, "message">
    readonly reason?: string
  }): Promise<AgentTurnResult>
  record(input: {
    readonly payload: unknown
    readonly streamId?: string
    readonly subject: AgentParticipantEnvelopeSubject
    readonly targetParticipantId: string
    readonly turnId?: string
  }): AgentParticipantProvenanceEnvelope
  sentCount(participantId: string): number
}

export interface AgentParticipantSessionAdapter {
  readonly runtimeSessionId: string
  readonly participantId: string
  readonly personaId: string
  readonly session: AgentRuntimeSession
  readonly send: AgentRuntimeSession["send"]
  readonly threadId: string
}

type RuntimeSessionWithCancel = AgentRuntimeSession & {
  readonly activeTurnId?: string
  cancel?(options?: { readonly turnId?: string }): Promise<unknown>
}

const AgentParticipantChannelContext =
  createContext<AgentParticipantChannelValue | null>(null)

export function useAgentParticipantChannel(): AgentParticipantChannelValue | null {
  return useContext(AgentParticipantChannelContext)
}

export function AgentParticipantChannelProvider({
  adapters,
  children,
  config,
  principalId,
}: {
  readonly adapters: readonly AgentParticipantSessionAdapter[]
  readonly children: ReactNode
  readonly config?: AgentParticipantChannelConfig
  readonly principalId: string
}) {
  const participantThreadIdsKey = participantThreadIdsKeyFor(
    normalizeParticipantThreadIds(config?.threadIds ?? []),
  )
  const participantThreadIds = useMemo(
    () =>
      participantThreadIdsKey ? participantThreadIdsKey.split("\u0000") : [],
    [participantThreadIdsKey],
  )
  const configured = participantThreadIds.length > 1
  const [events, setEvents] = useState<readonly AgentParticipantChannelEvent[]>(
    [],
  )

  const channel = useMemo<AgentSessionChannel | undefined>(() => {
    if (!configured) return undefined
    const byThreadId = new Map(
      adapters.map((adapter) => [adapter.threadId, adapter]),
    )
    if (participantThreadIds.some((threadId) => !byThreadId.has(threadId))) {
      return undefined
    }
    return buildAgentParticipantChannel({
      principalId,
      threads: participantThreadIds.map((threadId) => {
        const adapter = byThreadId.get(threadId)
        if (!adapter) {
          throw new Error(`Missing participant adapter: ${threadId}`)
        }
        return {
          threadId: adapter.threadId,
          principalId,
          personaId: adapter.personaId,
          runtimeSessionId: adapter.runtimeSessionId,
        }
      }),
    })
  }, [adapters, configured, participantThreadIds, principalId])

  const runtime = useMemo<ParticipantChannelRuntime | undefined>(() => {
    if (!channel) return undefined
    const sessions = new Map<string, ParticipantChannelSessionPort>()
    for (const adapter of adapters) {
      if (!participantThreadIds.includes(adapter.threadId)) continue
      const session = adapter.session as RuntimeSessionWithCancel
      const sessionId = adapter.runtimeSessionId
      const participantId = adapter.participantId
      const port: ParticipantChannelSessionPort = {
        get participantId() {
          return participantId
        },
        get sessionId() {
          return sessionId
        },
        get activeTurnId() {
          return session.activeTurnId
        },
        send: adapter.send,
      }
      if (session.cancel) {
        port.cancel = (options) =>
          Promise.resolve(session.cancel?.(options)).then(() => ({}))
      }
      sessions.set(participantId, port)
    }
    return createParticipantChannelRuntime({
      channel,
      sessions,
      onEvent: (event) =>
        setEvents((current) => [
          ...current,
          event as AgentParticipantChannelEvent,
        ]),
    })
  }, [adapters, channel, participantThreadIds])

  const value = useMemo<AgentParticipantChannelValue | null>(() => {
    if (!channel || !runtime) return null
    const coordinatorParticipantId = agentParticipantOwnerParticipantId(principalId)
    return {
      channel,
      events,
      dispatch: async (input) => {
        const result = await runtime.dispatch({
          coordinatorParticipantId,
          targetParticipantId: input.targetParticipantId,
          message: input.message,
          input: input.input,
        })
        return result.result
      },
      interrupt: async (input) => {
        const result = await runtime.interrupt({
          coordinatorParticipantId,
          targetParticipantId: input.targetParticipantId,
          message: input.message,
          input: input.input,
          reason: input.reason,
        })
        return result.result
      },
      record: (input) =>
        runtime.record({
          participantId: input.targetParticipantId,
          payload: input.payload,
          streamId: input.streamId,
          subject: input.subject,
          turnId: input.turnId,
        }),
      sentCount: (participantId) => runtime.sentCount(participantId),
    }
  }, [channel, events, principalId, runtime])

  return (
    <AgentParticipantChannelContext.Provider value={value}>
      {children}
    </AgentParticipantChannelContext.Provider>
  )
}

export function useParticipantSessionAdapter({
  participantThreadIds,
  principalId,
  session,
  thread,
}: {
  readonly participantThreadIds: readonly string[]
  readonly principalId: string
  readonly session: AgentRuntimeSession
  readonly thread: AgentThread
}): AgentParticipantSessionAdapter {
  const threadIdsKey = participantThreadIdsKeyFor(
    normalizeParticipantThreadIds(participantThreadIds),
  )
  const threadIds = useMemo(
    () => (threadIdsKey ? threadIdsKey.split("\u0000") : []),
    [threadIdsKey],
  )
  const bindingRequest = useMemo(
    () =>
      participantBindingRequest({
        participantThreadIds: threadIds,
        targetThreadId: thread.id,
      }),
    [thread.id, threadIds],
  )
  const runtimeSessionId = participantSessionId(thread)
  const participantId = participantIdForThread(thread.id)
  const personaId = thread.personaId
  const threadId = thread.id
  const send = useCallback<AgentRuntimeSession["send"]>(
    async (input) => {
      const resourceScope = input.headers?.[AGENT_SCOPE_HEADER]
      const [receipt, scopeProof] = await Promise.all([
        getAgentParticipantSessionBindingProof(bindingRequest, principalId),
        resourceScope
          ? getAgentScopeProof(resourceScope, principalId)
          : Promise.resolve(undefined),
      ])
      return session.send({
        ...input,
        headers: {
          ...input.headers,
          [AGENT_PERSONA_HEADER]: personaId,
          [AGENT_SESSION_BINDING_HEADER]: receipt.proof,
          ...(scopeProof ? { [AGENT_SCOPE_PROOF_HEADER]: scopeProof } : {}),
        },
      })
    },
    [bindingRequest, personaId, principalId, session],
  )
  return useMemo(
    () => ({
      runtimeSessionId,
      participantId,
      personaId,
      session,
      send,
      threadId,
    }),
    [runtimeSessionId, participantId, personaId, send, session, threadId],
  )
}

export function participantBindingRequest(input: {
  readonly participantThreadIds: readonly string[]
  readonly targetThreadId: string
}): AgentParticipantSessionBindingRequest {
  return {
    participantThreadIds: normalizeParticipantThreadIds(input.participantThreadIds),
    targetThreadId: input.targetThreadId,
  }
}

export function participantSessionId(thread: AgentThread): string {
  return agentParticipantRuntimeSessionId(
    thread.id,
    thread.runtime.session.sessionId,
  )
}

export function participantIdForThread(threadId: string): string {
  return agentParticipantPersonaParticipantId(threadId)
}

export { normalizeParticipantThreadIds }

export function useRegisteredParticipantAdapter({
  adapter,
  register,
}: {
  readonly adapter: AgentParticipantSessionAdapter | undefined
  readonly register: (adapter: AgentParticipantSessionAdapter) => () => void
}) {
  useEffect(() => {
    if (!adapter) return undefined
    return register(adapter)
  }, [adapter, register])
}

function participantThreadIdsKeyFor(threadIds: readonly string[]): string {
  return threadIds.join("\u0000")
}
