// @vitest-environment jsdom

import { act, createElement } from "react"
import * as ReactRuntime from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AgentRuntimeSessionProvider } from "@zigil/agent-react/session"
import {
  addContextAttachment,
  getAttentionExclusions,
  getTurnContextAttachments,
  resetContextDraftForTests,
  setContextDraftScope,
  setAttentionItemExcluded,
} from "@zigil/agent-react/context-draft"
import type { AgentRuntimeSession } from "@zigil/agent-surface/contracts"
import {
  AttentionProvider,
  type AttentionContext,
} from "@zigil/agent-react/attention"

import { useAppAgentSession } from "@/hooks/use-app-agent-session"
import { resetAttentionDeliveryForTests } from "@/lib/agent-attention-delivery"

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
  resetAttentionDeliveryForTests()
  setContextDraftScope("thread-a")
  capturedSession = null
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  resetContextDraftForTests()
  resetAttentionDeliveryForTests()
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

  it("automatically sends the current selection and only activity since the last successful turn", async () => {
    const send = vi.fn().mockResolvedValue({ status: "succeeded" as const })
    const firstActivity = activity(100, "select", "passage-a")
    await renderSession(runtimeSession(send), attention([firstActivity]))

    await act(async () => {
      await requireCapturedSession().send({ message: "What changed?" })
    })

    expect(sentContext(send, 0)).toMatchObject({
      selection: { kind: "passage", id: "passage-b", label: "Passage B" },
      history: [{ timestamp: 100, action: "select" }],
    })

    const secondActivity = activity(200, "edit", "passage-b")
    await renderSession(
      runtimeSession(send),
      attention([firstActivity, secondActivity]),
    )
    await act(async () => {
      await requireCapturedSession().send({ message: "And now?" })
    })

    expect(sentContext(send, 1)).toMatchObject({
      selection: { kind: "passage", id: "passage-b", label: "Passage B" },
      history: [{ timestamp: 200, action: "edit" }],
    })
  })

  it("retries the same meaningful activity after a failed turn", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        status: "failed" as const,
        error: { message: "model failed" },
      })
      .mockResolvedValueOnce({ status: "succeeded" as const })
    const context = attention([activity(100, "edit", "passage-b")])
    await renderSession(runtimeSession(send), context)

    await act(async () => {
      await requireCapturedSession().send({ message: "Try once" })
      await requireCapturedSession().send({ message: "Try again" })
    })

    expect(sentContext(send, 0).history).toEqual(sentContext(send, 1).history)
  })

  it("leaves activity recorded during an in-flight turn pending", async () => {
    let finishFirstTurn: (() => void) | undefined
    const send = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Awaited<ReturnType<AgentRuntimeSession["send"]>>>(
            (resolve) => {
              finishFirstTurn = () => resolve({ status: "succeeded" })
            },
          ),
      )
      .mockResolvedValueOnce({ status: "succeeded" as const })
    const firstActivity = activity(100, "select", "passage-a")
    await renderSession(runtimeSession(send), attention([firstActivity]))

    const firstTurn = requireCapturedSession().send({ message: "Start" })
    const secondActivity = activity(200, "edit", "passage-b")
    await renderSession(
      runtimeSession(send),
      attention([firstActivity, secondActivity]),
    )
    await act(async () => {
      finishFirstTurn?.()
      await firstTurn
    })
    await act(async () => {
      await requireCapturedSession().send({ message: "What happened next?" })
    })

    expect(sentContext(send, 1).history).toEqual([
      expect.objectContaining({ timestamp: 200, action: "edit" }),
    ])
  })
})

async function renderSession(
  session: AgentRuntimeSession,
  attentionContext?: AttentionContext,
): Promise<void> {
  await act(() => {
    const capture = createElement(SessionCapture)
    root.render(
      createElement(AgentRuntimeSessionProvider, {
        session,
        children: attentionContext
          ? createElement(AttentionProvider, {
              context: attentionContext,
              children: capture,
            })
          : capture,
      }),
    )
  })
  expect(capturedSession).not.toBeNull()
}

function attention(history: AttentionContext["history"]): AttentionContext {
  const selection = {
    kind: "passage",
    id: "passage-b",
    label: "Passage B",
  }
  return {
    application: "sigil-chat",
    route: "/review",
    workspace: { kind: "review", id: "draft", label: "Draft" },
    selection,
    selections: [selection],
    history,
  }
}

function activity(timestamp: number, action: "select" | "edit", id: string) {
  return {
    action,
    target: { kind: "passage", id, label: id },
    timestamp,
  } as const
}

function sentContext(send: ReturnType<typeof vi.fn>, index: number) {
  const input = send.mock.calls[index]?.[0] as { clientContext?: string }
  expect(input.clientContext).toBeDefined()
  return JSON.parse(input.clientContext ?? "{}") as {
    selection?: { kind: string; id: string; label?: string }
    history?: Array<{ timestamp: number; action: string }>
  }
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
