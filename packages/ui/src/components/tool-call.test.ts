// @vitest-environment jsdom

import type { AgentToolCallPart } from "@zigil/agent/contracts"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ToolCall } from "./tool-call"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("ToolCall approval controls", () => {
  it("disables a replayed approval request when the app says it is not resumable", () => {
    const onInputResponses = vi.fn()

    act(() => {
      root.render(
        createElement(ToolCall, {
          canRespond: true,
          canRespondToInputRequest: () => false,
          onInputResponses,
          part: approvalPart("request-1"),
        }),
      )
    })

    const allow = button("Allow once")
    expect(allow.disabled).toBe(true)

    allow.click()
    expect(onInputResponses).not.toHaveBeenCalled()
  })

  it("keeps a live approval request clickable when the app says it is resumable", () => {
    const onInputResponses = vi.fn()

    act(() => {
      root.render(
        createElement(ToolCall, {
          canRespond: true,
          canRespondToInputRequest: (requestId) => requestId === "request-1",
          onInputResponses,
          part: approvalPart("request-1"),
        }),
      )
    })

    const allow = button("Allow once")
    expect(allow.disabled).toBe(false)

    allow.click()
    expect(onInputResponses).toHaveBeenCalledWith([
      { optionId: "allow", requestId: "request-1" },
    ])
  })
})

function approvalPart(requestId: string): AgentToolCallPart {
  return {
    id: `tool:${requestId}`,
    input: {},
    inputRequest: {
      options: [
        { id: "allow", label: "Allow" },
        { id: "deny", label: "Deny", style: "danger" },
      ],
      prompt: "Approve this tool call?",
      requestId,
    },
    kind: "tool-call",
    name: "sigil-test-tool",
    state: "approval-requested",
    type: "tool-call",
  }
}

function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  )
  if (!match) throw new Error(`Missing button ${label}`)
  return match
}
