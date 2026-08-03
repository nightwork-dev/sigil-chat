/**
 * Guards against an @ai-sdk/openai upstream defect: the Responses API prompt
 * converter (`convertToOpenAIResponsesInput`, bundled inside eve's
 * `#compiled/@ai-sdk/openai`) unconditionally turns every `tool-approval-response`
 * tool-message part into an OpenAI `mcp_approval_response` input item,
 * regardless of whether the paired tool call is `providerExecuted`. That item
 * type is only valid for provider-executed (MCP) tool calls; for a
 * client-executed authored tool (every gonk/authored tool this stack has),
 * OpenAI never issued the approval the item claims to answer, and the
 * spurious item desyncs the Responses API's call/output pairing bookkeeping —
 * producing a 400 "No tool output found for function call <id>" even though
 * the function_call/function_call_output pair is present and correctly
 * ordered in the same request.
 *
 * A bare `tool-approval-response` for a non-`providerExecuted` call carries no
 * information OpenAI needs once the paired tool result exists, so dropping it
 * from the outbound prompt is safe and complete. This module resolves the
 * real linkage (approvalId -> tool-call -> providerExecuted) rather than
 * assuming every approval is client-side, so a genuine provider-executed
 * approval response is preserved untouched.
 *
 * Delete this module (and its call site in model-provider.ts) once
 * @ai-sdk/openai's converter itself gates the `mcp_approval_response`
 * conversion on `providerExecuted`.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isToolCallPart(
  part: unknown,
): part is { type: "tool-call"; toolCallId: string; providerExecuted?: boolean } {
  return (
    isRecord(part) &&
    part.type === "tool-call" &&
    typeof part.toolCallId === "string"
  )
}

function isToolApprovalRequestPart(
  part: unknown,
): part is { type: "tool-approval-request"; approvalId: string; toolCallId: string } {
  return (
    isRecord(part) &&
    part.type === "tool-approval-request" &&
    typeof part.approvalId === "string" &&
    typeof part.toolCallId === "string"
  )
}

function isToolApprovalResponsePart(
  part: unknown,
): part is { type: "tool-approval-response"; approvalId: string } {
  return (
    isRecord(part) &&
    part.type === "tool-approval-response" &&
    typeof part.approvalId === "string"
  )
}

/**
 * Filters `tool-approval-response` parts out of a language-model prompt when
 * they cannot be proven to belong to a `providerExecuted` tool call.
 *
 * Keys on the actual pairing carried in the prompt: it scans every assistant
 * message for `tool-approval-request` parts (approvalId -> toolCallId) and
 * `tool-call` parts (toolCallId -> providerExecuted), then drops any
 * `tool-approval-response` part in a `tool` message whose linkage does not
 * resolve to a `providerExecuted: true` tool call. If the linkage cannot be
 * resolved at all (no matching request or tool-call found in the prompt), the
 * part is dropped — the same conservative default as an unresolved
 * client-side approval, since we cannot prove it was provider-executed.
 *
 * If filtering empties a `tool` message's content array entirely, the whole
 * message is dropped rather than sent as an empty-content item: the
 * Responses API input format is a flat item list (not nested messages), so
 * an empty tool message contributes nothing either way, and dropping it
 * avoids relying on every downstream consumer accepting a zero-length
 * content array.
 *
 * Generic and duck-typed against `unknown` prompt/message/part shapes
 * (rather than importing a specific `@ai-sdk/provider` message-part type) so
 * this stays correct across the different `ai` versions Game and Chat each
 * resolve to.
 */
export function stripClientApprovalParts<TPrompt>(prompt: TPrompt): TPrompt {
  if (!Array.isArray(prompt)) return prompt

  const toolCallIdByApprovalId = new Map<string, string>()
  const providerExecutedByToolCallId = new Map<string, boolean>()

  for (const message of prompt) {
    if (!isRecord(message) || message.role !== "assistant") continue
    const content = message.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (isToolCallPart(part)) {
        providerExecutedByToolCallId.set(
          part.toolCallId,
          part.providerExecuted === true,
        )
      } else if (isToolApprovalRequestPart(part)) {
        toolCallIdByApprovalId.set(part.approvalId, part.toolCallId)
      }
    }
  }

  let changed = false
  const filteredMessages: unknown[] = []

  for (const message of prompt) {
    if (!isRecord(message) || message.role !== "tool") {
      filteredMessages.push(message)
      continue
    }
    const content = message.content
    if (!Array.isArray(content)) {
      filteredMessages.push(message)
      continue
    }

    const keptParts = content.filter((part) => {
      if (!isToolApprovalResponsePart(part)) return true
      const toolCallId = toolCallIdByApprovalId.get(part.approvalId)
      const providerExecuted =
        toolCallId !== undefined
          ? providerExecutedByToolCallId.get(toolCallId)
          : undefined
      return providerExecuted === true
    })

    if (keptParts.length === content.length) {
      filteredMessages.push(message)
      continue
    }

    changed = true
    if (keptParts.length === 0) continue
    filteredMessages.push({ ...message, content: keptParts })
  }

  return (changed ? filteredMessages : prompt) as unknown as TPrompt
}
