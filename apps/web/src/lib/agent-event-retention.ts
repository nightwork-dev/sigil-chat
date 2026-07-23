import type { BuildEveForkSeedInput } from "@zigil/agent-eve/session"

export type AgentRuntimeStreamEvent = BuildEveForkSeedInput["events"][number]

type AssistantFinishReason = Extract<
  AgentRuntimeStreamEvent,
  { type: "message.completed" }
>["data"]["finishReason"]

export const AGENT_EVENT_RETENTION_POLICY = "sigil-chat-event-retention-v2"
export const AGENT_EVENT_MAX_COUNT = 1_000
export const AGENT_EVENT_MAX_BYTES = 2 * 1024 * 1024
export const AGENT_ACTION_PAYLOAD_MAX_BYTES = 64 * 1024

export interface AgentEventCompactionReceipt {
  policyVersion: typeof AGENT_EVENT_RETENTION_POLICY
  firstRetainedStreamIndex: number
  omittedEventCount: number
  compactedAt: string
}

interface PersistedEventMeta {
  meta?: { at: string }
}

type LiveActionRequest = Extract<
  AgentRuntimeStreamEvent,
  { type: "actions.requested" }
>["data"]["actions"][number]

type LiveActionResult = Extract<
  AgentRuntimeStreamEvent,
  { type: "action.result" }
>["data"]["result"]

type LiveInputRequest = Extract<
  AgentRuntimeStreamEvent,
  { type: "input.requested" }
>["data"]["requests"][number]

// Retention v2 (owner decision, 2026-07-20): action inputs/outputs are
// persisted verbatim as JSON, bounded per payload. `redacted?: true` survives
// only so v1 records still replay; new writes never set it on action events.
export type RetainedJsonValue =
  | string
  | number
  | boolean
  | null
  | RetainedJsonValue[]
  | { [key: string]: RetainedJsonValue }

export type PersistedAgentAction =
  | {
      callId: string
      input: RetainedJsonValue
      kind: "load-skill"
      redacted?: true
    }
  | {
      callId: string
      input: RetainedJsonValue
      kind: "tool-call"
      redacted?: true
      toolName: string
    }
  | {
      callId: string
      description?: string
      input: RetainedJsonValue
      kind: "subagent-call"
      name: string
      nodeId: string
      redacted?: true
      subagentName: string
    }
  | {
      callId: string
      description?: string
      input: RetainedJsonValue
      kind: "remote-agent-call"
      name: string
      nodeId: string
      redacted?: true
      remoteAgentName: string
    }

export type PersistedAgentActionResult =
  | {
      callId: string
      kind: "load-skill-result"
      name?: string
      output: RetainedJsonValue
      redacted?: true
    }
  | {
      callId: string
      kind: "tool-result"
      output: RetainedJsonValue
      redacted?: true
      toolName: string
    }
  | {
      callId: string
      kind: "subagent-result"
      output: RetainedJsonValue
      redacted?: true
      subagentName: string
    }

export interface PersistedInputRequest {
  action: {
    callId: string
    input: RetainedJsonValue
    kind: "tool-call"
    toolName: string
  }
  display?: "confirmation" | "select" | "text"
  options?: Array<{ id: string; label: string }>
  prompt: string
  requestId: string
}

export type PersistedAgentEvent = PersistedEventMeta &
  (
    | {
        type: "session.started"
        data: {
          invocation?: {
            kind: "subagent"
            parentCallId: string
            parentSessionId: string
            parentTurnId: string
            name: string
          }
        }
      }
    | {
        type: "turn.started" | "turn.completed" | "turn.cancelled"
        data: { sequence: number; turnId: string }
      }
    | {
        type: "message.received"
        data: { message: string; sequence: number; turnId: string }
      }
    | {
        type: "message.completed"
        data: {
          finishReason: AssistantFinishReason
          message: string | null
          sequence: number
          stepIndex: number
          turnId: string
        }
      }
    | {
        type: "actions.requested"
        data: {
          actions: PersistedAgentAction[]
          redacted?: true
          sequence: number
          stepIndex: number
          turnId: string
        }
      }
    | {
        type: "input.requested"
        data: {
          redacted?: true
          requests: Array<PersistedInputRequest>
          sequence: number
          stepIndex: number
          turnId: string
        }
      }
    | {
        type: "action.result"
        data: {
          error?: { code: string; message: string }
          redacted?: true
          result: PersistedAgentActionResult
          sequence: number
          status: "completed" | "failed" | "rejected"
          stepIndex: number
          turnId: string
        }
      }
    | {
        type: "authorization.completed"
        data: {
          name: string
          outcome: "authorized" | "declined" | "failed" | "timed-out"
          redacted: true
          sequence: number
          stepIndex: number
          turnId: string
        }
      }
    | {
        type: "subagent.called"
        data: {
          callId: string
          childSessionId: string
          name: string
          sequence: number
          sessionId: string
          toolName: string
          turnId: string
          workflowId: string
        }
      }
    | {
        type: "subagent.started"
        data: { callId: string; subagentName: string }
      }
    | {
        type: "subagent.event"
        data: {
          callId: string
          event: PersistedAgentEvent
          redacted?: true
          subagentName: string
        }
      }
    | {
        type: "subagent.completed"
        data: {
          callId: string
          output: RetainedJsonValue
          redacted?: true
          subagentName: string
        }
      }
    | {
        type: "step.started"
        data: { sequence: number; stepIndex: number; turnId: string }
      }
    | {
        type: "step.completed"
        data: {
          finishReason: AssistantFinishReason
          sequence: number
          stepIndex: number
          turnId: string
        }
      }
    | {
        type: "step.failed"
        data: {
          code: string
          message: string
          redacted?: true
          sequence: number
          stepIndex: number
          turnId: string
        }
      }
    | {
        type: "turn.failed"
        data: {
          code: string
          message: string
          redacted?: true
          sequence: number
          turnId: string
        }
      }
    | {
        type: "session.failed"
        data: {
          code: string
          message: string
          redacted?: true
          sessionId: string
        }
      }
    | { type: "session.completed" }
    | {
        type: "compaction.requested"
        data: {
          modelId: string
          sequence: number
          sessionId: string
          turnId: string
          usageInputTokens: number | null
        }
      }
    | {
        type: "compaction.completed"
        data: {
          modelId: string
          sequence: number
          sessionId: string
          turnId: string
        }
      }
  )

export interface PersistedAgentEventSnapshot {
  events: PersistedAgentEvent[]
  compaction: AgentEventCompactionReceipt
}

export interface AgentEventRetentionOptions {
  maxBytes?: number
  maxEvents?: number
  now?: () => Date
}

export function sanitizeAndBoundAgentEvents(
  events: readonly AgentRuntimeStreamEvent[],
  options: AgentEventRetentionOptions = {},
): PersistedAgentEventSnapshot {
  const sanitized = events.flatMap((item, sourceIndex) => {
    const retained = sanitizeAgentEvent(item)
    return retained ? [{ event: retained, sourceIndex }] : []
  })
  const maxEvents = options.maxEvents ?? AGENT_EVENT_MAX_COUNT
  const maxBytes = options.maxBytes ?? AGENT_EVENT_MAX_BYTES
  const retained: typeof sanitized = []
  let retainedBytes = 0

  for (let index = sanitized.length - 1; index >= 0; index -= 1) {
    if (retained.length >= maxEvents) break
    const candidate = sanitized[index]
    if (!candidate) continue
    const candidateBytes = serializedBytes(candidate.event)
    if (retainedBytes + candidateBytes > maxBytes) break
    retained.unshift(candidate)
    retainedBytes += candidateBytes
  }

  const first = retained[0]
  return {
    events: retained.map(({ event }) => event),
    compaction: {
      policyVersion: AGENT_EVENT_RETENTION_POLICY,
      firstRetainedStreamIndex: first
        ? eventStreamIndex(first.event, first.sourceIndex)
        : events.length,
      omittedEventCount: events.length - retained.length,
      compactedAt: (options.now ?? (() => new Date()))().toISOString(),
    },
  }
}

export function agentEventsForReplay(
  events: readonly PersistedAgentEvent[],
): AgentRuntimeStreamEvent[] {
  return events.flatMap((event) => {
    const replay = replayAgentEvent(event)
    return replay ? [replay] : []
  })
}

function sanitizeAgentEvent(
  event: AgentRuntimeStreamEvent,
): PersistedAgentEvent | null {
  const meta = event.meta ? { meta: { at: event.meta.at } } : {}
  switch (event.type) {
    case "message.received":
      return retainedEvent({
        type: event.type,
        data: {
          message: event.data.message,
          sequence: event.data.sequence,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "message.completed":
      return retainedEvent({
        type: event.type,
        data: {
          finishReason: event.data.finishReason,
          message: event.data.message,
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "actions.requested":
      return retainedEvent({
        type: event.type,
        data: {
          actions: event.data.actions.map(retainActionRequest),
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "input.requested":
      return retainedEvent({
        type: event.type,
        data: {
          requests: event.data.requests.map(retainInputRequest),
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "action.result":
      return retainedEvent({
        type: event.type,
        data: {
          ...(event.data.error
            ? {
                error: {
                  code: event.data.error.code,
                  message: event.data.error.message,
                },
              }
            : {}),
          result: retainActionResult(event.data.result),
          sequence: event.data.sequence,
          status: event.data.status,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "authorization.completed":
      return retainedEvent({
        type: event.type,
        data: {
          name: event.data.name,
          outcome: event.data.outcome,
          redacted: true,
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "subagent.called":
      return retainedEvent({
        type: event.type,
        data: {
          callId: event.data.callId,
          childSessionId: event.data.childSessionId,
          name: event.data.name,
          sequence: event.data.sequence,
          sessionId: event.data.sessionId,
          toolName: event.data.toolName,
          turnId: event.data.turnId,
          workflowId: event.data.workflowId,
        },
        ...meta,
      })
    case "subagent.event": {
      const child = sanitizeAgentEvent(event.data.event)
      if (!child) return null
      return retainedEvent({
        type: event.type,
        data: {
          callId: event.data.callId,
          event: child,
          subagentName: event.data.subagentName,
        },
        ...meta,
      })
    }
    case "subagent.completed":
      return retainedEvent({
        type: event.type,
        data: {
          callId: event.data.callId,
          output: boundPayload(event.data.output),
          subagentName: event.data.subagentName,
        },
        ...meta,
      })
    case "step.completed":
      return retainedEvent({
        type: event.type,
        data: {
          finishReason: event.data.finishReason,
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "step.failed":
      return retainedEvent({
        type: event.type,
        data: {
          code: event.data.code,
          message: event.data.message,
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "turn.failed":
      return retainedEvent({
        type: event.type,
        data: {
          code: event.data.code,
          message: event.data.message,
          sequence: event.data.sequence,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "session.failed":
      return retainedEvent({
        type: event.type,
        data: {
          code: event.data.code,
          message: event.data.message,
          sessionId: event.data.sessionId,
        },
        ...meta,
      })
    case "session.started":
      return retainedEvent({
        type: event.type,
        data: {
          ...(event.data.invocation
            ? { invocation: structuredClone(event.data.invocation) }
            : {}),
        },
        ...meta,
      })
    case "turn.started":
    case "turn.completed":
    case "turn.cancelled":
      return retainedEvent({
        type: event.type,
        data: {
          sequence: event.data.sequence,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "step.started":
      return retainedEvent({
        type: event.type,
        data: {
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "session.completed":
      return retainedEvent({ type: event.type, ...meta })
    case "compaction.requested":
      return retainedEvent({
        type: event.type,
        data: {
          modelId: event.data.modelId,
          sequence: event.data.sequence,
          sessionId: event.data.sessionId,
          turnId: event.data.turnId,
          usageInputTokens: event.data.usageInputTokens,
        },
        ...meta,
      })
    case "compaction.completed":
      return retainedEvent({
        type: event.type,
        data: {
          modelId: event.data.modelId,
          sequence: event.data.sequence,
          sessionId: event.data.sessionId,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "subagent.started":
      return retainedEvent({
        type: event.type,
        data: {
          callId: event.data.callId,
          subagentName: event.data.subagentName,
        },
        ...meta,
      })
    case "message.appended":
    case "reasoning.appended":
    case "reasoning.completed":
    case "result.completed":
    case "authorization.required":
    case "session.waiting":
      return null
  }
}

function replayAgentEvent(
  event: PersistedAgentEvent,
): AgentRuntimeStreamEvent | null {
  const meta = event.meta ? { meta: { at: event.meta.at } } : {}
  switch (event.type) {
    case "session.started":
      return rawEvent({ type: event.type, data: event.data, ...meta })
    case "turn.started":
    case "turn.completed":
    case "turn.cancelled":
      return rawEvent({ type: event.type, data: event.data, ...meta })
    case "message.received":
      return rawEvent({ type: event.type, data: event.data, ...meta })
    case "message.completed":
      return rawEvent({ type: event.type, data: event.data, ...meta })
    case "actions.requested":
      return rawEvent({
        type: event.type,
        data: {
          actions: event.data.actions.map(replayActionRequest),
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "input.requested":
      return rawEvent({
        type: event.type,
        data: {
          requests: event.data.requests.map(
            (request) =>
              structuredClone(request) as unknown as LiveInputRequest,
          ),
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "action.result":
      return rawEvent({
        type: event.type,
        data: {
          ...(event.data.error ? { error: event.data.error } : {}),
          result: replayActionResult(event.data.result),
          sequence: event.data.sequence,
          status: event.data.status,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "authorization.completed":
      return rawEvent({
        type: event.type,
        data: {
          name: event.data.name,
          outcome: event.data.outcome,
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "subagent.called":
      return rawEvent({ type: event.type, data: event.data, ...meta })
    case "subagent.started":
      return rawEvent({ type: event.type, data: event.data, ...meta })
    case "subagent.event": {
      const child = replayAgentEvent(event.data.event)
      if (!child) return null
      return rawEvent({
        type: event.type,
        data: {
          callId: event.data.callId,
          event: child,
          subagentName: event.data.subagentName,
        },
        ...meta,
      })
    }
    case "subagent.completed":
      return rawEvent({
        type: event.type,
        data: {
          callId: event.data.callId,
          output: event.data.output as never,
          subagentName: event.data.subagentName,
        },
        ...meta,
      })
    case "step.started":
      return rawEvent({ type: event.type, data: event.data, ...meta })
    case "step.completed":
      return rawEvent({ type: event.type, data: event.data, ...meta })
    case "step.failed": {
      const { redacted: _redacted, ...data } = event.data
      return rawEvent({ type: event.type, data, ...meta })
    }
    case "turn.failed": {
      const { redacted: _redacted, ...data } = event.data
      return rawEvent({ type: event.type, data, ...meta })
    }
    case "session.failed": {
      const { redacted: _redacted, ...data } = event.data
      return rawEvent({ type: event.type, data, ...meta })
    }
    case "session.completed":
      return rawEvent({ type: event.type, ...meta })
    case "compaction.requested":
      return rawEvent({ type: event.type, data: event.data, ...meta })
    case "compaction.completed":
      return rawEvent({ type: event.type, data: event.data, ...meta })
  }
}

function retainActionRequest(action: LiveActionRequest): PersistedAgentAction {
  const input = boundPayload(action.input)
  switch (action.kind) {
    case "load-skill":
      return { callId: action.callId, input, kind: action.kind }
    case "tool-call":
      return {
        callId: action.callId,
        input,
        kind: action.kind,
        toolName: action.toolName,
      }
    case "subagent-call":
      return {
        callId: action.callId,
        description: action.description,
        input,
        kind: action.kind,
        name: action.name,
        nodeId: action.nodeId,
        subagentName: action.subagentName,
      }
    case "remote-agent-call":
      return {
        callId: action.callId,
        description: action.description,
        input,
        kind: action.kind,
        name: action.name,
        nodeId: action.nodeId,
        remoteAgentName: action.remoteAgentName,
      }
  }
}

function retainInputRequest(request: LiveInputRequest): PersistedInputRequest {
  const persisted = jsonClone(request) as unknown as PersistedInputRequest
  return {
    ...persisted,
    action: {
      callId: request.action.callId,
      input: boundPayload(request.action.input),
      kind: "tool-call",
      toolName:
        "toolName" in request.action ? request.action.toolName : "unknown-tool",
    },
  }
}

function replayActionRequest(action: PersistedAgentAction): LiveActionRequest {
  const { redacted: _redacted, ...request } = action
  if (
    (request.kind === "subagent-call" ||
      request.kind === "remote-agent-call") &&
    !request.description
  ) {
    // v1 records redacted the description; keep their replay shape valid.
    return {
      ...request,
      description: "Details redacted",
    } as LiveActionRequest
  }
  return request as LiveActionRequest
}

function retainActionResult(
  result: LiveActionResult,
): PersistedAgentActionResult {
  const output = boundPayload(result.output)
  switch (result.kind) {
    case "load-skill-result":
      return {
        callId: result.callId,
        kind: result.kind,
        ...(result.name ? { name: result.name } : {}),
        output,
      }
    case "tool-result":
      return {
        callId: result.callId,
        kind: result.kind,
        output,
        toolName: result.toolName,
      }
    case "subagent-result":
      return {
        callId: result.callId,
        kind: result.kind,
        output,
        subagentName: result.subagentName,
      }
  }
}

function replayActionResult(
  result: PersistedAgentActionResult,
): LiveActionResult {
  const { redacted: _redacted, ...value } = result
  return value as LiveActionResult
}

// One oversized tool payload must not evict the rest of the transcript from
// the snapshot budget, so payloads above the cap persist as an explicit
// truncation marker instead of the raw value.
function boundPayload(value: unknown): RetainedJsonValue {
  if (value === undefined || value === null) return null
  const bytes = serializedBytes(value)
  if (bytes > AGENT_ACTION_PAYLOAD_MAX_BYTES) {
    return {
      approximateBytes: bytes,
      sigilRetentionTruncated: true,
    }
  }
  return jsonClone(value)
}

function jsonClone(value: unknown): RetainedJsonValue {
  const serialized = JSON.stringify(value)
  return serialized === undefined
    ? null
    : (JSON.parse(serialized) as RetainedJsonValue)
}

function retainedEvent(value: PersistedAgentEvent): PersistedAgentEvent {
  return value
}

function rawEvent(value: AgentRuntimeStreamEvent): AgentRuntimeStreamEvent {
  return value
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function eventStreamIndex(
  event: PersistedAgentEvent,
  sourceIndex: number,
): number {
  const data = "data" in event ? event.data : undefined
  return data && "sequence" in data && typeof data.sequence === "number"
    ? data.sequence
    : sourceIndex + 1
}
