import type {
  AgentMessage,
  AgentToolInputRequest,
} from "@zigil/agent/contracts"
import { describe, expect, it } from "vitest"

import {
  buildToolInputResponseBatch,
  collectPendingToolInputRequests,
} from "./agent-tool-input-batch"

describe("tool input approval batches", () => {
  it("accumulates sequential approval clicks until the whole batch is answered", () => {
    const pendingRequests = [request("request-1"), request("request-2")]

    const first = buildToolInputResponseBatch({
      incomingResponses: [{ optionId: "allow", requestId: "request-1" }],
      pendingRequests,
      queuedResponses: [],
    })
    expect(first.batchResponses).toBeNull()
    expect(first.queuedResponses).toEqual([
      { optionId: "allow", requestId: "request-1" },
    ])

    const second = buildToolInputResponseBatch({
      incomingResponses: [{ optionId: "allow", requestId: "request-2" }],
      pendingRequests,
      queuedResponses: first.queuedResponses,
    })
    expect(second.batchResponses).toEqual([
      { optionId: "allow", requestId: "request-1" },
      { optionId: "allow", requestId: "request-2" },
    ])
    expect(second.queuedResponses).toEqual([])
  })

  it("accepts a rapid full batch as one continuation payload", () => {
    const update = buildToolInputResponseBatch({
      incomingResponses: [
        { optionId: "allow", requestId: "request-1" },
        { optionId: "allow", requestId: "request-2" },
      ],
      pendingRequests: [request("request-1"), request("request-2")],
      queuedResponses: [],
    })

    expect(update.batchResponses).toEqual([
      { optionId: "allow", requestId: "request-1" },
      { optionId: "allow", requestId: "request-2" },
    ])
  })

  it("keeps mixed approval and denial choices in the serialized batch order", () => {
    const update = buildToolInputResponseBatch({
      incomingResponses: [
        { optionId: "deny", requestId: "request-2" },
        { optionId: "allow", requestId: "request-1" },
      ],
      pendingRequests: [request("request-1"), request("request-2")],
      queuedResponses: [],
    })

    expect(update.batchResponses).toEqual([
      { optionId: "allow", requestId: "request-1" },
      { optionId: "deny", requestId: "request-2" },
    ])
  })

  it("dedupes duplicate response and pending request IDs", () => {
    const update = buildToolInputResponseBatch({
      incomingResponses: [
        { optionId: "deny", requestId: "request-1" },
        { optionId: "allow", requestId: "request-1" },
      ],
      pendingRequests: [
        request("request-1"),
        request("request-1"),
        request("request-2"),
      ],
      queuedResponses: [{ optionId: "allow", requestId: "request-2" }],
    })

    expect(update.batchResponses).toEqual([
      { optionId: "allow", requestId: "request-1" },
      { optionId: "allow", requestId: "request-2" },
    ])
  })

  it("does not create an empty continuation batch", () => {
    const update = buildToolInputResponseBatch({
      incomingResponses: [],
      pendingRequests: [request("request-1")],
      queuedResponses: [],
    })

    expect(update.acceptedRequestIds).toEqual([])
    expect(update.batchResponses).toBeNull()
  })

  it("collects only unresolved approval requests from replayed messages", () => {
    expect(
      collectPendingToolInputRequests([
        message("request-1", "approval-requested"),
        message("request-1", "approval-requested"),
        message("request-2", "approval-responded"),
        message("request-3", "output-available"),
      ]),
    ).toEqual([request("request-1")])
  })
})

function request(requestId: string): AgentToolInputRequest {
  return {
    options: [
      { id: "allow", label: "Allow" },
      { id: "deny", label: "Deny", style: "danger" },
    ],
    prompt: `Approve ${requestId}?`,
    requestId,
  }
}

function message(
  requestId: string,
  state: "approval-requested" | "approval-responded" | "output-available",
): AgentMessage {
  return {
    id: `message:${requestId}:${state}`,
    parts: [
      {
        id: `tool:${requestId}:${state}`,
        input: {},
        inputRequest: request(requestId),
        ...(state === "approval-responded"
          ? { inputResponse: { optionId: "allow", requestId } }
          : {}),
        name: "sigil-test-tool",
        state,
        type: "tool-call",
      },
    ],
    role: "assistant",
  } as AgentMessage
}
