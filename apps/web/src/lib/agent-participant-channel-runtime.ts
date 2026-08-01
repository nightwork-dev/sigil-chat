import type {
  AgentChannelParticipant,
  AgentChannelParticipantProvenance,
  AgentChannelPersonaSessionParticipant,
  AgentParticipantDispatchBounds,
  AgentParticipantDispatchReceipt,
  AgentParticipantEnvelopeSubject,
  AgentParticipantInterruptionRequest,
  AgentParticipantProvenanceEnvelope,
  AgentSessionChannel,
} from "@workspace/agent-contracts/participant-channel"
import {
  isAgentParticipantDispatchReceiptForChannel,
  isAgentParticipantInterruptionRequestForTarget,
  isAgentSessionChannel,
} from "@workspace/agent-contracts/participant-channel"
import type { AgentSendInput, AgentTurnResult } from "@zigil/agent/contracts"

export interface ParticipantCancelResult {
  readonly outcome?: "accepted" | "no-active-turn"
}

export interface ParticipantChannelSessionPort {
  readonly participantId: string
  readonly sessionId: string
  readonly activeTurnId?: string
  send(input: AgentSendInput): Promise<AgentTurnResult>
  cancel?(options?: {
    readonly turnId?: string
  }): Promise<ParticipantCancelResult>
}

export type ParticipantChannelEvent =
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

export interface ParticipantDispatchInput {
  readonly coordinatorParticipantId: string
  readonly targetParticipantId: string
  readonly message: string
  readonly input?: Omit<AgentSendInput, "message">
  readonly bounds?: Partial<AgentParticipantDispatchBounds>
}

export interface ParticipantInterruptInput extends ParticipantDispatchInput {
  readonly reason?: string
}

export interface ParticipantProvenanceRecordInput {
  readonly participantId: string
  readonly payload: unknown
  readonly streamId?: string
  readonly subject: AgentParticipantEnvelopeSubject
  readonly turnId?: string
}

export interface ParticipantDispatchResult {
  readonly receipt: AgentParticipantDispatchReceipt
  readonly result: AgentTurnResult
}

export interface ParticipantChannelRuntime {
  readonly channel: AgentSessionChannel
  readonly events: readonly ParticipantChannelEvent[]
  dispatch(input: ParticipantDispatchInput): Promise<ParticipantDispatchResult>
  interrupt(
    input: ParticipantInterruptInput,
  ): Promise<ParticipantDispatchResult>
  participantState(
    participantId: string,
  ): AgentChannelPersonaSessionParticipant["state"] | undefined
  record(
    input: ParticipantProvenanceRecordInput,
  ): AgentParticipantProvenanceEnvelope
  sentCount(participantId: string): number
}

type PersonaSessionProvenance = AgentChannelParticipantProvenance & {
  readonly kind: "persona-session"
  readonly personaId: string
  readonly runtimeSessionId: string
  readonly applicationThreadId: string
}

export function createParticipantChannelRuntime({
  channel,
  sessions,
  now = () => Date.now(),
  onEvent,
}: {
  readonly channel: AgentSessionChannel
  readonly sessions: ReadonlyMap<string, ParticipantChannelSessionPort>
  readonly now?: () => number
  readonly onEvent?: (event: ParticipantChannelEvent) => void
}): ParticipantChannelRuntime {
  if (!isAgentSessionChannel(channel)) {
    throw new Error("Invalid participant channel.")
  }

  const events: ParticipantChannelEvent[] = []
  const states = new Map<
    string,
    AgentChannelPersonaSessionParticipant["state"]
  >()
  const sent = new Map<string, number>()
  const inFlight = new Map<string, Promise<AgentTurnResult>>()

  for (const participant of channel.participants) {
    if (participant.kind === "persona-session") {
      states.set(participant.participantId, participant.state ?? "dormant")
    }
  }

  function emit(event: ParticipantChannelEvent): void {
    events.push(event)
    onEvent?.(event)
  }

  async function sendToTarget(
    receipt: AgentParticipantDispatchReceipt,
    input: ParticipantDispatchInput,
  ): Promise<ParticipantDispatchResult> {
    const target = requirePersonaProvenance(receipt.target)
    const port = requireSession(target)
    const turn = port.send({
      ...input.input,
      message: input.message,
    })
    inFlight.set(target.participantId, turn)
    sent.set(target.participantId, (sent.get(target.participantId) ?? 0) + 1)
    const result = await turn.finally(() => {
      if (inFlight.get(target.participantId) === turn) {
        inFlight.delete(target.participantId)
      }
    })
    return { receipt, result }
  }

  function dispatch(
    input: ParticipantDispatchInput,
  ): Promise<ParticipantDispatchResult> {
    const receipt = createDispatchReceipt(input)
    emit({ type: "participant.dispatch", receipt })
    return sendToTarget(receipt, input)
  }

  function record(
    input: ParticipantProvenanceRecordInput,
  ): AgentParticipantProvenanceEnvelope {
    const provenance = provenanceFor(input.participantId)
    const envelope: AgentParticipantProvenanceEnvelope = {
      kind: "agent.participant.provenance-envelope",
      subject: input.subject,
      provenance,
      payload: input.payload,
      createdAt: now(),
      ...(input.turnId ? { turnId: input.turnId } : {}),
      ...(input.streamId ? { streamId: input.streamId } : {}),
    }
    emit({ type: "participant.envelope", envelope })
    return envelope
  }

  async function interrupt(
    input: ParticipantInterruptInput,
  ): Promise<ParticipantDispatchResult> {
    const target = activateTarget(input.targetParticipantId)
    const requester = provenanceFor(input.coordinatorParticipantId)
    const port = requireSession(target)
    const observedTurnId = port.activeTurnId
    if (!observedTurnId) return dispatch(input)

    const request: AgentParticipantInterruptionRequest = {
      kind: "agent.participant.interrupt",
      requester,
      target,
      observedTurnId,
      requestedAt: now(),
      ...(input.reason ? { reason: input.reason } : {}),
    }
    if (!isAgentParticipantInterruptionRequestForTarget(request, target)) {
      throw new Error("Invalid participant interruption request.")
    }

    emit({ type: "participant.interrupt", request, observedTurnId })
    await port.cancel?.({ turnId: observedTurnId })
    await inFlight.get(target.participantId)
    return dispatch(input)
  }

  function createDispatchReceipt(
    input: ParticipantDispatchInput,
  ): AgentParticipantDispatchReceipt {
    const target = activateTarget(input.targetParticipantId)
    const coordinator = provenanceFor(input.coordinatorParticipantId)
    const receipt: AgentParticipantDispatchReceipt = {
      kind: "agent.participant.dispatch",
      coordinator,
      target,
      intended: {
        channelId: channel.channelId,
        targetParticipantId: target.participantId,
        targetRuntimeSessionId: target.runtimeSessionId,
        targetApplicationThreadId: target.applicationThreadId,
      },
      bounds: {
        requestedAt: input.bounds?.requestedAt ?? now(),
        ...(input.bounds?.contextScopeIds
          ? { contextScopeIds: input.bounds.contextScopeIds }
          : {}),
        ...(input.bounds?.deadlineAt
          ? { deadlineAt: input.bounds.deadlineAt }
          : {}),
        ...(input.bounds?.maxOutputTokens !== undefined
          ? { maxOutputTokens: input.bounds.maxOutputTokens }
          : {}),
      },
    }
    const effectiveChannel = channelWithCurrentStates()
    if (
      !isAgentParticipantDispatchReceiptForChannel(receipt, effectiveChannel)
    ) {
      throw new Error("Invalid participant dispatch receipt.")
    }
    return receipt
  }

  function activateTarget(participantId: string): PersonaSessionProvenance {
    const participant = findParticipant(participantId)
    if (!participant || participant.kind !== "persona-session") {
      throw new Error(`Unknown persona-session participant: ${participantId}`)
    }
    states.set(participant.participantId, "active")
    return provenanceFor(participant.participantId) as PersonaSessionProvenance
  }

  function provenanceFor(
    participantId: string,
  ): AgentChannelParticipantProvenance {
    const participant = findParticipant(participantId)
    if (!participant) {
      throw new Error(`Unknown channel participant: ${participantId}`)
    }
    if (participant.kind === "human") {
      return {
        channelId: channel.channelId,
        participantId: participant.participantId,
        principalId: participant.principalId,
        kind: "human",
        role: participant.role,
      }
    }
    return {
      channelId: channel.channelId,
      participantId: participant.participantId,
      principalId: participant.principalId,
      kind: "persona-session",
      role: participant.role,
      state:
        states.get(participant.participantId) ?? participant.state ?? "dormant",
      personaId: participant.personaId,
      runtimeSessionId: participant.runtimeSessionId,
      applicationThreadId: participant.applicationThreadId,
    }
  }

  function channelWithCurrentStates(): AgentSessionChannel {
    return {
      ...channel,
      participants: channel.participants.map((participant) => {
        if (participant.kind !== "persona-session") return participant
        return {
          ...participant,
          state: states.get(participant.participantId) ?? participant.state,
        }
      }),
    }
  }

  function requireSession(
    target: PersonaSessionProvenance,
  ): ParticipantChannelSessionPort {
    const port = sessions.get(target.participantId)
    if (!port) throw new Error(`Missing session port: ${target.participantId}`)
    if (port.participantId !== target.participantId) {
      throw new Error(`Session port mismatch: ${target.participantId}`)
    }
    return port
  }

  function requirePersonaProvenance(
    provenance: AgentChannelParticipantProvenance,
  ): PersonaSessionProvenance {
    if (
      provenance.kind !== "persona-session" ||
      !provenance.personaId ||
      !provenance.runtimeSessionId ||
      !provenance.applicationThreadId
    ) {
      throw new Error("Expected persona-session provenance.")
    }
    return provenance as PersonaSessionProvenance
  }

  function findParticipant(
    participantId: string,
  ): AgentChannelParticipant | undefined {
    return channel.participants.find(
      (participant) => participant.participantId === participantId,
    )
  }

  return {
    channel,
    events,
    dispatch,
    interrupt,
    participantState: (participantId) => states.get(participantId),
    record,
    sentCount: (participantId) => sent.get(participantId) ?? 0,
  }
}

export function createSingleSessionChannel(input: {
  readonly channelId: string
  readonly principalId: string
  readonly personaId: string
  readonly runtimeSessionId: string
  readonly applicationThreadId: string
}): AgentSessionChannel {
  return {
    channelId: input.channelId,
    ownerPrincipalId: input.principalId,
    participants: [
      {
        kind: "human",
        participantId: `${input.principalId}:owner`,
        principalId: input.principalId,
        role: "owner",
      },
      {
        kind: "persona-session",
        participantId: `${input.personaId}:session`,
        principalId: input.principalId,
        personaId: input.personaId,
        runtimeSessionId: input.runtimeSessionId,
        applicationThreadId: input.applicationThreadId,
        role: "participant",
        state: "active",
      },
    ],
  }
}
