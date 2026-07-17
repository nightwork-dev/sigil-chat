// @vitest-environment jsdom

import { act, createElement } from "react"
import * as ReactRuntime from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AgentRuntimeSessionProvider,
  addContextAttachment,
  getAttentionExclusions,
  getTurnContextAttachments,
  resetContextDraftForTests,
  setAttentionItemExcluded,
  type AgentRuntimeSession,
} from "@niwork/agent"

import { useAppAgentSession } from "@/hooks/use-app-agent-session"

// Vitest externalizes the published package before the React plugin can apply
// the automatic JSX transform. The application build does not.
Object.assign(globalThis, { React: ReactRuntime })

let container: HTMLDivElement
let root: Root
let capturedSession: AgentRuntimeSession | null

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  resetContextDraftForTests()
  capturedSession = null
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  resetContextDraftForTests()
})

describe("useAppAgentSession", () => {
  it("preserves turn attachments and exclusions after a failed turn", async () => {
    const send = vi.fn().mockResolvedValue({
      status: "failed" as const,
      error: { message: "model failed" },
    })
    await renderSession(runtimeSession(send))
    seedPendingContext()

    await act(async () => {
      await requireCapturedSession().send({ message: "retryable request" })
    })

    expect(send).toHaveBeenCalledOnce()
    expect(getTurnContextAttachments()).toHaveLength(1)
    expect(getAttentionExclusions()).toEqual(["selection:passage:hidden"])
  })

  it("clears turn-only context only after a successful turn", async () => {
    const send = vi.fn().mockResolvedValue({ status: "succeeded" as const })
    await renderSession(runtimeSession(send))
    seedPendingContext()

    await act(async () => {
      await requireCapturedSession().send({ message: "completed request" })
    })

    expect(getTurnContextAttachments()).toEqual([])
    expect(getAttentionExclusions()).toEqual([])
  })
})

async function renderSession(session: AgentRuntimeSession): Promise<void> {
  await act(() => {
    root.render(
      createElement(
        AgentRuntimeSessionProvider,
        { session, children: createElement(SessionCapture) },
      ),
    )
  })
  expect(capturedSession).not.toBeNull()
}

function SessionCapture() {
  capturedSession = useAppAgentSession()
  return null
}

function requireCapturedSession(): AgentRuntimeSession {
  if (!capturedSession) throw new Error("Agent session was not captured")
  return capturedSession
}

function runtimeSession(
  send: AgentRuntimeSession["send"],
): AgentRuntimeSession {
  return {
    capabilities: { reset: false, stop: false, streaming: true },
    data: { messages: [] },
    status: "idle",
    send,
  }
}

function seedPendingContext(): void {
  addContextAttachment({
    id: "passage:preflight",
    source: "application-selection",
    inclusion: "user-added",
    resource: { kind: "passage", id: "preflight" },
    label: "Preflight",
    retention: "turn",
  })
  setAttentionItemExcluded("selection:passage:hidden", true)
}
