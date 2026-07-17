import type { HandleMessageStreamEvent } from "eve/client"

type AssistantFinishReason = Extract<
  HandleMessageStreamEvent,
  { type: "message.completed" }
>["data"]["finishReason"]

export const AGENT_EVENT_RETENTION_POLICY = "sigil-chat-event-retention-v1"
export const AGENT_EVENT_MAX_COUNT = 1_000
export const AGENT_EVENT_MAX_BYTES = 2 * 1024 * 1024

export interface AgentEventCompactionReceipt {
  policyVersion: typeof AGENT_EVENT_RETENTION_POLICY
  firstRetainedStreamIndex: number
  omittedEventCount: number
  compactedAt: string
}

interface PersistedEventMeta {
  meta?: { at: string }
}

export type PersistedAgentAction =
  | {
      callId: string
      input: Record<string, never>
      kind: "load-skill"
      redacted: true
    }
  | {
      callId: string
      input: Record<string, never>
      kind: "tool-call"
      redacted: true
      toolName: string
    }
  | {
      callId: string
      input: Record<string, never>
      kind: "subagent-call"
      name: string
      nodeId: string
      redacted: true
      subagentName: string
    }
  | {
      callId: string
      input: Record<string, never>
      kind: "remote-agent-call"
      name: string
      nodeId: string
      redacted: true
      remoteAgentName: string
    }

export type PersistedAgentActionResult =
  | {
      callId: string
      kind: "load-skill-result"
      name?: string
      output: null
      redacted: true
    }
  | {
      callId: string
      kind: "tool-result"
      output: null
      redacted: true
      toolName: string
    }
  | {
      callId: string
      kind: "subagent-result"
      output: null
      redacted: true
      subagentName: string
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
          redacted: true
          sequence: number
          stepIndex: number
          turnId: string
        }
      }
    | {
        type: "input.requested"
        data: {
          redacted: true
          requests: Array<{
            action: {
              callId: string
              input: Record<string, never>
              kind: "tool-call"
              toolName: string
            }
            display?: "confirmation" | "select" | "text"
            prompt: "Input details redacted"
            requestId: string
          }>
          sequence: number
          stepIndex: number
          turnId: string
        }
      }
    | {
        type: "action.result"
        data: {
          error?: { code: string; message: "Action failed" }
          redacted: true
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
          redacted: true
          subagentName: string
        }
      }
    | {
        type: "subagent.completed"
        data: {
          callId: string
          output: "Output redacted"
          redacted: true
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
          message: "Model step failed"
          redacted: true
          sequence: number
          stepIndex: number
          turnId: string
        }
      }
    | {
        type: "turn.failed"
        data: {
          code: string
          message: "Agent turn failed"
          redacted: true
          sequence: number
          turnId: string
        }
      }
    | {
        type: "session.failed"
        data: {
          code: string
          message: "Agent session failed"
          redacted: true
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
  events: readonly HandleMessageStreamEvent[],
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
): HandleMessageStreamEvent[] {
  return events.flatMap((event) => {
    const replay = replayAgentEvent(event)
    return replay ? [replay] : []
  })
}

function sanitizeAgentEvent(
  event: HandleMessageStreamEvent,
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
          actions: event.data.actions.map(redactActionRequest),
          redacted: true,
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      })
    case "input.requested": {
      const retained: Extract<
        PersistedAgentEvent,
        { type: "input.requested" }
      > = {
        type: "input.requested",
        data: {
          redacted: true,
          requests: event.data.requests.map((request) => ({
            action: {
              callId: request.action.callId,
              input: {},
              kind: "tool-call" as const,
              toolName:
                "toolName" in request.action
                  ? request.action.toolName
                  : "unknown-tool",
            },
            ...(normalizeInputDisplay(request.display)
              ? { display: normalizeInputDisplay(request.display) }
              : {}),
            prompt: "Input details redacted",
            requestId: request.requestId,
          })),
          sequence: event.data.sequence,
          stepIndex: event.data.stepIndex,
          turnId: event.data.turnId,
        },
        ...meta,
      }
      return retainedEvent(retained)
    }
    case "action.result":
      return retainedEvent({
        type: event.type,
        data: {
          ...(event.data.error
            ? {
                error: {
                  code: event.data.error.code,
                  message: "Action failed",
                },
              }
            : {}),
          redacted: true,
          result: redactActionResult(event.data.result),
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
          redacted: true,
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
          output: "Output redacted",
          redacted: true,
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
          message: "Model step failed",
          redacted: true,
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
          message: "Agent turn failed",
          redacted: true,
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
          message: "Agent session failed",
          redacted: true,
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
): HandleMessageStreamEvent | null {
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
            ({ action, display, prompt, requestId }) => ({
              action,
              ...(display ? { display } : {}),
              prompt,
              requestId,
            }),
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
          output: event.data.output,
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

type ActionRequest = Extract<
  HandleMessageStreamEvent,
  { type: "actions.requested" }
>["data"]["actions"][number]

function redactActionRequest(action: ActionRequest): PersistedAgentAction {
  switch (action.kind) {
    case "load-skill":
      return {
        callId: action.callId,
        input: {},
        kind: action.kind,
        redacted: true,
      }
    case "tool-call":
      return {
        callId: action.callId,
        input: {},
        kind: action.kind,
        redacted: true,
        toolName: action.toolName,
      }
    case "subagent-call":
      return {
        callId: action.callId,
        input: {},
        kind: action.kind,
        name: action.name,
        nodeId: action.nodeId,
        redacted: true,
        subagentName: action.subagentName,
      }
    case "remote-agent-call":
      return {
        callId: action.callId,
        input: {},
        kind: action.kind,
        name: action.name,
        nodeId: action.nodeId,
        redacted: true,
        remoteAgentName: action.remoteAgentName,
      }
  }
}

function replayActionRequest(action: PersistedAgentAction): ActionRequest {
  const { redacted: _redacted, ...request } = action
  if (
    request.kind === "subagent-call" ||
    request.kind === "remote-agent-call"
  ) {
    return { ...request, description: "Details redacted" }
  }
  return request
}

type ActionResult = Extract<
  HandleMessageStreamEvent,
  { type: "action.result" }
>["data"]["result"]

function redactActionResult(result: ActionResult): PersistedAgentActionResult {
  switch (result.kind) {
    case "load-skill-result":
      return {
        callId: result.callId,
        kind: result.kind,
        ...(result.name ? { name: result.name } : {}),
        output: null,
        redacted: true,
      }
    case "tool-result":
      return {
        callId: result.callId,
        kind: result.kind,
        output: null,
        redacted: true,
        toolName: result.toolName,
      }
    case "subagent-result":
      return {
        callId: result.callId,
        kind: result.kind,
        output: null,
        redacted: true,
        subagentName: result.subagentName,
      }
  }
}

function replayActionResult(result: PersistedAgentActionResult): ActionResult {
  const { redacted: _redacted, ...value } = result
  return value
}

function normalizeInputDisplay(
  value: unknown,
): "confirmation" | "select" | "text" | undefined {
  return value === "confirmation" || value === "select" || value === "text"
    ? value
    : undefined
}

function retainedEvent(value: PersistedAgentEvent): PersistedAgentEvent {
  return value
}

function rawEvent(value: HandleMessageStreamEvent): HandleMessageStreamEvent {
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
