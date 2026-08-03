import { describe, expect, it } from "vitest"

import { stripClientApprovalParts } from "./strip-client-approval-parts"

// Shape produced by eve's harness on an approval-resume step (matching the
// probe/repro material used to diagnose the OpenAI 400 "No tool output found
// for function call <id>" bug): a `tool-approval-request` paired with a
// `tool-call` in the assistant message, then a `tool` message carrying ONLY
// a `tool-approval-response`, followed by the `tool-result` message AI SDK
// core appends after executing the tool client-side.
function buildClientToolApprovalPrompt() {
  return [
    { role: "user", content: [{ type: "text", text: "Run pwd." }] },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "bash",
          input: { command: "pwd" },
        },
        {
          type: "tool-approval-request",
          approvalId: "approval-1",
          toolCallId: "call-1",
        },
      ],
    },
    {
      role: "tool",
      content: [
        { type: "tool-approval-response", approvalId: "approval-1", approved: true },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "bash",
          output: { type: "text", value: "canonical:/workspace" },
        },
      ],
    },
  ]
}

describe("stripClientApprovalParts", () => {
  it("drops a tool-approval-response for a non-providerExecuted (client-side) tool call", () => {
    const prompt = buildClientToolApprovalPrompt()

    const filtered = stripClientApprovalParts(prompt)

    // The approval-only tool message had exactly one part; filtering it
    // empties the message, so the whole message is dropped.
    expect(filtered).toHaveLength(3)
    expect(filtered.some((message) => message.role === "tool")).toBe(true)
    const remainingToolMessages = filtered.filter(
      (message) => message.role === "tool",
    )
    expect(remainingToolMessages).toHaveLength(1)
    expect(remainingToolMessages[0]!.content).toEqual([
      {
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "bash",
        output: { type: "text", value: "canonical:/workspace" },
      },
    ])

    // Everything else is byte-equal to the input.
    expect(filtered[0]).toBe(prompt[0])
    expect(filtered[1]).toBe(prompt[1])
  })

  it("preserves a genuine providerExecuted (MCP-shaped) tool-approval-response", () => {
    const prompt = [
      { role: "user", content: [{ type: "text", text: "Search the docs." }] },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-mcp-1",
            toolName: "web_search",
            input: { query: "docs" },
            providerExecuted: true,
          },
          {
            type: "tool-approval-request",
            approvalId: "approval-mcp-1",
            toolCallId: "call-mcp-1",
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-approval-response",
            approvalId: "approval-mcp-1",
            approved: true,
          },
        ],
      },
    ]

    const filtered = stripClientApprovalParts(prompt)

    expect(filtered).toEqual(prompt)
    expect(filtered).toBe(prompt) // no-op fast path: nothing filtered
  })

  it("drops a tool-approval-response whose linkage cannot be resolved from the prompt", () => {
    const prompt = [
      { role: "user", content: [{ type: "text", text: "Hi." }] },
      {
        role: "tool",
        content: [
          {
            type: "tool-approval-response",
            approvalId: "orphan-approval",
            approved: true,
          },
        ],
      },
    ]

    const filtered = stripClientApprovalParts(prompt)

    // The lone tool message becomes empty and is dropped entirely.
    expect(filtered).toEqual([prompt[0]])
  })

  it("drops the tool-approval-response but keeps a sibling tool-result part in the same message", () => {
    const prompt = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "call-2", toolName: "bash", input: {} },
          {
            type: "tool-approval-request",
            approvalId: "approval-2",
            toolCallId: "call-2",
          },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-approval-response", approvalId: "approval-2", approved: true },
          {
            type: "tool-result",
            toolCallId: "call-2",
            toolName: "bash",
            output: { type: "text", value: "ok" },
          },
        ],
      },
    ]

    const filtered = stripClientApprovalParts(prompt)

    expect(filtered).toHaveLength(2)
    expect(filtered[1]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-2",
          toolName: "bash",
          output: { type: "text", value: "ok" },
        },
      ],
    })
  })

  it("leaves non-array prompts and messages without content arrays untouched", () => {
    expect(stripClientApprovalParts(null)).toBeNull()
    expect(stripClientApprovalParts(undefined)).toBeUndefined()

    const prompt = [{ role: "system", content: "You are a helpful assistant." }]
    expect(stripClientApprovalParts(prompt)).toBe(prompt)
  })
})
