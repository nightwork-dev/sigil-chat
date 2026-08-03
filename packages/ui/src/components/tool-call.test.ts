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

describe("ToolCall question controls", () => {
  it("renders a text input for a zero-option pending request", () => {
    act(() => {
      root.render(
        createElement(ToolCall, {
          canRespond: true,
          onInputResponses: vi.fn(),
          part: questionPart("request-2", []),
        }),
      )
    })

    expect(textbox()).not.toBeNull()
  })

  it("submits typed text as {requestId, text}", () => {
    const onInputResponses = vi.fn()

    act(() => {
      root.render(
        createElement(ToolCall, {
          canRespond: true,
          onInputResponses,
          part: questionPart("request-3", []),
        }),
      )
    })

    const input = textbox()!
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      setValue.call(input, "  a plain answer  ")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => {
      button("Send").click()
    })

    expect(onInputResponses).toHaveBeenCalledWith([
      { requestId: "request-3", text: "a plain answer" },
    ])
  })

  it("renders no text input for a binary approval", () => {
    act(() => {
      root.render(
        createElement(ToolCall, {
          canRespond: true,
          onInputResponses: vi.fn(),
          part: approvalPart("request-4"),
        }),
      )
    })

    expect(textbox()).toBeNull()
  })

  it("renders both option buttons and a text input for a question with options", () => {
    act(() => {
      root.render(
        createElement(ToolCall, {
          canRespond: true,
          onInputResponses: vi.fn(),
          part: questionPart("request-5", [
            { id: "yes", label: "Yes" },
            { id: "no", label: "No" },
            { id: "maybe", label: "Maybe" },
          ]),
        }),
      )
    })

    expect(button("Yes")).not.toBeNull()
    expect(button("No")).not.toBeNull()
    expect(button("Maybe")).not.toBeNull()
    expect(textbox()).not.toBeNull()
  })
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

function textbox(): HTMLInputElement | null {
  return container.querySelector("input[type='text'], input:not([type])")
}

function questionPart(
  requestId: string,
  options: { id: string; label: string }[],
): AgentToolCallPart {
  return {
    id: `tool:${requestId}`,
    input: {},
    inputRequest: {
      options,
      prompt: "What should I do next?",
      requestId,
    },
    kind: "tool-call",
    name: "sigil-test-question",
    state: "approval-requested",
    type: "tool-call",
  }
}
