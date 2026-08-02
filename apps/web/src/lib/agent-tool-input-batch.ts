import type {
  AgentMessage,
  AgentToolInputRequest,
  AgentToolInputResponse,
} from "@zigil/agent/contracts"

export interface ToolInputBatchUpdate {
  readonly acceptedRequestIds: readonly string[]
  readonly batchResponses: readonly AgentToolInputResponse[] | null
  readonly queuedResponses: readonly AgentToolInputResponse[]
}

export function collectPendingToolInputRequests(
  messages: readonly AgentMessage[],
): readonly AgentToolInputRequest[] {
  const requests = new Map<string, AgentToolInputRequest>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type !== "tool-call" ||
        part.state !== "approval-requested" ||
        !part.inputRequest ||
        part.inputResponse ||
        requests.has(part.inputRequest.requestId)
      ) {
        continue
      }
      requests.set(part.inputRequest.requestId, part.inputRequest)
    }
  }
  return [...requests.values()]
}

export function toolInputBatchKey(
  requests: readonly AgentToolInputRequest[],
): string {
  return requests.map((request) => request.requestId).join("\u0000")
}

export function dedupeToolInputResponses(
  responses: readonly AgentToolInputResponse[],
): readonly AgentToolInputResponse[] {
  const byRequestId = new Map<string, AgentToolInputResponse>()
  for (const response of responses) {
    if (!response.requestId) continue
    byRequestId.set(response.requestId, response)
  }
  return [...byRequestId.values()]
}

export function buildToolInputResponseBatch({
  incomingResponses,
  pendingRequests,
  queuedResponses,
  submittedRequestIds = [],
}: {
  readonly incomingResponses: readonly AgentToolInputResponse[]
  readonly pendingRequests: readonly AgentToolInputRequest[]
  readonly queuedResponses: readonly AgentToolInputResponse[]
  readonly submittedRequestIds?: readonly string[]
}): ToolInputBatchUpdate {
  const pendingRequestIds = [
    ...new Set(pendingRequests.map((request) => request.requestId)),
  ]
  if (pendingRequestIds.length === 0) {
    return {
      acceptedRequestIds: [],
      batchResponses: null,
      queuedResponses: [],
    }
  }

  const pending = new Set(pendingRequestIds)
  const submitted = new Set(submittedRequestIds)
  const queued = new Map<string, AgentToolInputResponse>()
  for (const response of queuedResponses) {
    if (pending.has(response.requestId) && !submitted.has(response.requestId)) {
      queued.set(response.requestId, response)
    }
  }

  const acceptedRequestIds: string[] = []
  for (const response of dedupeToolInputResponses(incomingResponses)) {
    if (!pending.has(response.requestId) || submitted.has(response.requestId)) {
      continue
    }
    if (!queued.has(response.requestId))
      acceptedRequestIds.push(response.requestId)
    queued.set(response.requestId, response)
  }

  if (acceptedRequestIds.length === 0) {
    return {
      acceptedRequestIds,
      batchResponses: null,
      queuedResponses: [...queued.values()],
    }
  }

  if (!pendingRequestIds.every((requestId) => queued.has(requestId))) {
    return {
      acceptedRequestIds,
      batchResponses: null,
      queuedResponses: [...queued.values()],
    }
  }

  return {
    acceptedRequestIds,
    batchResponses: pendingRequestIds.map((requestId) =>
      queued.get(requestId)!,
    ),
    queuedResponses: [],
  }
}
