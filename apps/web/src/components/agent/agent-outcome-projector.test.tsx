// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AgentRuntimeSession } from "@zigil/agent/contracts"

const commandMocks = vi.hoisted(() => ({
  dispatchAgentClientCommand: vi.fn(),
  validateAgentClientCommand: vi.fn(),
}))

const domMocks = vi.hoisted(() => ({
  dispatchAgentDomCommand: vi.fn(),
  dispatchAgentDomCommands: vi.fn(),
  isAgentDomCommand: vi.fn(() => false),
}))

vi.mock("@/lib/agent-client-command", () => commandMocks)
vi.mock("@/lib/agent-dom-effects", () => domMocks)

import {
  AgentOutcomeProjector,
  extractClientCommand,
} from "./agent-outcome-projector"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
    root = undefined
  }
  commandMocks.dispatchAgentClientCommand.mockReset()
  commandMocks.validateAgentClientCommand.mockReset()
  domMocks.dispatchAgentDomCommand.mockReset()
  domMocks.dispatchAgentDomCommands.mockReset()
  domMocks.isAgentDomCommand.mockReset()
  domMocks.isAgentDomCommand.mockReturnValue(false)
})

describe("extractClientCommand", () => {
  const command = {
    type: "ui.highlight",
    payload: { actions: [{ selector: "#target", effect: "pulse" }] },
  }

  it.each([
    { clientCommand: command },
    { data: { clientCommand: command } },
    { structuredContent: { clientCommand: command } },
  ])(
    "extracts client commands from supported tool output envelopes",
    (output) => {
      expect(extractClientCommand(output)).toEqual(command)
    },
  )

  it("ignores unrelated and malformed tool output", () => {
    expect(extractClientCommand(null)).toBeNull()
    expect(extractClientCommand({ data: "not-an-envelope" })).toBeNull()
    expect(extractClientCommand({ structuredContent: {} })).toBeNull()
  })

  it("retries a validated client command when an earlier projection was cancelled", async () => {
    const container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    const deferredValidations = [
      deferred<typeof asyncCommand>(),
      deferred<typeof asyncCommand>(),
    ]
    commandMocks.validateAgentClientCommand
      .mockReturnValueOnce(deferredValidations[0].promise)
      .mockReturnValueOnce(deferredValidations[1].promise)

    act(() => {
      root?.render(
        <AgentOutcomeProjector
          session={sessionWithToolCall("tool-call-1", asyncCommand)}
        />,
      )
    })
    expect(commandMocks.validateAgentClientCommand).toHaveBeenCalledTimes(1)

    act(() => {
      root?.render(
        <AgentOutcomeProjector
          session={sessionWithToolCall("tool-call-1", asyncCommand)}
        />,
      )
    })
    expect(commandMocks.validateAgentClientCommand).toHaveBeenCalledTimes(2)

    await act(async () => {
      deferredValidations[0].resolve(asyncCommand)
      await deferredValidations[0].promise
    })
    expect(commandMocks.dispatchAgentClientCommand).not.toHaveBeenCalled()

    await act(async () => {
      deferredValidations[1].resolve(asyncCommand)
      await deferredValidations[1].promise
    })
    expect(commandMocks.dispatchAgentClientCommand).toHaveBeenCalledTimes(1)
    expect(commandMocks.dispatchAgentClientCommand).toHaveBeenCalledWith(
      asyncCommand,
    )
  })
})

const asyncCommand = {
  type: "agent.domain.outcome",
  payload: {
    id: "work-items:story.transition:8:S1.1",
    kind: "work-items.changed",
    resource: {
      kind: "work-items-board",
      id: "work-items",
      revision: 8,
    },
    operation: "story.transition",
    changedIds: ["S1.1"],
  },
}

function sessionWithToolCall(
  callId: string,
  clientCommand: unknown,
): AgentRuntimeSession {
  return {
    capabilities: {},
    data: {
      messages: [
        {
          id: "message-1",
          role: "assistant",
          parts: [
            {
              id: callId,
              name: "story_tool",
              output: { structuredContent: { clientCommand } },
              state: "output-available",
              type: "tool-call",
            },
          ],
        },
      ],
    },
    send: async () => ({ status: "succeeded" }),
    status: "idle",
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}
