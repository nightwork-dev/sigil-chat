// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react"
import * as ReactRuntime from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { UseEveRuntimeSessionOptions } from "@zigil/agent/react/eve"
import { useAgentRuntimeSession } from "@zigil/agent/react"
import type {
  AgentRuntimeSession,
  AgentTurnResult,
} from "@zigil/agent/contracts"

import { AppAgentSessions } from "./agent-sessions"
import {
  participantIdForThread,
  useAgentParticipantChannel,
  type AgentParticipantChannelValue,
} from "@/lib/agent-participant-channel"
import {
  AgentThreadRepository,
  type AgentThread,
  type AgentThreadKvStore,
  type AgentThreadPreference,
} from "@/lib/agent-threads-domain"
import type { AgentRuntimeStreamEvent } from "@/lib/agent-event-retention"

// Vitest externalizes the published source package before the React plugin can
// apply the automatic JSX transform. The application build does not.
Object.assign(globalThis, { React: ReactRuntime })

type AgentAdapterSnapshot = Parameters<
  NonNullable<UseEveRuntimeSessionOptions["onFinish"]>
>[0]

type EveCallbacks = {
  initialSession?: { sessionId?: string }
  onEvent?: (event: AgentRuntimeStreamEvent) => void
  onFinish?: (snapshot: AgentAdapterSnapshot) => void
}

type MockEveSession = AgentRuntimeSession & {
  activeTurnId?: string
  cancelTurnIds: Array<string | undefined>
  callbacks: EveCallbacks
  pendingSend: Promise<AgentTurnResult> | null
  primary: boolean
  sent: Array<{ headers?: Record<string, string>; message?: unknown }>
  sendResult: AgentTurnResult | null
}

const harness = vi.hoisted(() => ({
  eveCallbacks: null as EveCallbacks | null,
  nextSnapshot: null as AgentAdapterSnapshot | null,
  session: null as AgentRuntimeSession | null,
  participantChannel: null as AgentParticipantChannelValue | null,
  participantProofRequests: [] as Array<{
    participantThreadIds: readonly string[]
    targetThreadId: string
  }>,
  eveSessions: new Map<string, MockEveSession>(),
  eveRuntimeMountCount: 0,
  eveRuntimeSequence: 0,
  expectedRevisions: [] as Array<{
    operation: "consume" | "rename" | "snapshot"
    revision: number | undefined
  }>,
  // Overrides the mocked Eve `send` result for a single test. Defaults to
  // "succeeded" (matching the pre-existing test suite's expectations) when
  // null.
  sendResult: null as AgentTurnResult | null,
  // When set, the mocked Eve `send` returns this promise instead of
  // resolving immediately — lets a test hold a turn "in flight" to drive the
  // overlapping-send guard.
  pendingSend: null as Promise<AgentTurnResult> | null,
  eveSendCallCount: 0,
  lastEveSendInput: null as { headers?: Record<string, string> } | null,
}))

let repository: AgentThreadRepository
let threadStore: TestAgentThreadKvStore<AgentThread>
const TEST_USER_ID = "session-test-user"

vi.mock("@zigil/agent/react/eve", () => ({
  useEveRuntimeSession: (callbacks: EveCallbacks) => {
    const fallbackId = ReactRuntime.useRef<string | null>(null)
    if (!fallbackId.current) {
      harness.eveRuntimeSequence += 1
      fallbackId.current = `runtime-${harness.eveRuntimeSequence}`
    }
    const sessionId = callbacks.initialSession?.sessionId ?? fallbackId.current
    const session =
      harness.eveSessions.get(sessionId) ?? createMockEveSession(sessionId)
    if (!harness.eveSessions.has(sessionId)) {
      harness.eveRuntimeMountCount += 1
    }
    session.callbacks = callbacks
    session.primary ||= !harness.eveCallbacks
    harness.eveSessions.set(sessionId, session)
    if (session.primary || !harness.eveCallbacks) {
      harness.eveCallbacks = callbacks
    }
    return session
  },
}))

function createMockEveSession(sessionId: string): MockEveSession {
  return {
    callbacks: {},
    cancelTurnIds: [],
    capabilities: { reset: true, stop: true, streaming: true, cancel: true },
    data: { messages: [] },
    pendingSend: null,
    primary: false,
    sendResult: null,
    sent: [],
    status: "idle",
    send(input: { headers?: Record<string, string>; message?: unknown }) {
      this.sent.push(input)
      if (this.primary) {
        harness.eveSendCallCount += 1
        harness.lastEveSendInput = input
      }
      this.activeTurnId = `${sessionId}-turn-${this.sent.length}`
      const pending = this.pendingSend ?? harness.pendingSend
      if (pending) {
        return pending.finally(() => {
          delete this.activeTurnId
        })
      }
      if (this.primary && harness.nextSnapshot) {
        this.callbacks.onFinish?.(harness.nextSnapshot)
      }
      const result =
        this.sendResult ??
        (this.primary ? harness.sendResult : null) ??
        ({ status: "succeeded" as const } satisfies AgentTurnResult)
      delete this.activeTurnId
      return Promise.resolve(result)
    },
    cancel(options?: { turnId?: string }) {
      this.cancelTurnIds.push(options?.turnId)
      return Promise.resolve({ outcome: "accepted" })
    },
    reset: vi.fn(),
    stop: vi.fn(),
  } as MockEveSession
}

vi.mock("@/lib/agent-threads", () => ({
  useActiveAgentThreadPreference: () => ({
    data: repository.getActivePreference(TEST_USER_ID),
    isError: false,
    isPending: false,
  }),
  useAgentThread: (id: string | undefined) => ({
    data: id ? repository.get(TEST_USER_ID, id) : undefined,
    isError: false,
    isPending: false,
  }),
  useAgentThreads: () => ({
    data: repository.list(TEST_USER_ID),
    isError: false,
    isPending: false,
  }),
  useConsumeAgentThreadForkSeed: () => ({
    mutateAsync: (input: { id: string; expectedRevision?: number }) => {
      harness.expectedRevisions.push({
        operation: "consume",
        revision: input.expectedRevision,
      })
      return Promise.resolve(
        repository.consumeForkSeed(
          TEST_USER_ID,
          input.id,
          input.expectedRevision,
        ),
      )
    },
  }),
  useCreateAgentThread: () => ({
    mutateAsync: (input: { personaId?: string; title?: string }) =>
      Promise.resolve(repository.create(TEST_USER_ID, input)),
  }),
  useForkAgentThread: () => ({
    mutateAsync: (input: {
      sourceThreadId: string
      expectedRevision?: number
    }) => Promise.resolve(repository.fork(TEST_USER_ID, input)),
  }),
  useRenameAgentThread: () => ({
    mutateAsync: (input: {
      id: string
      title: string
      expectedRevision?: number
    }) => {
      harness.expectedRevisions.push({
        operation: "rename",
        revision: input.expectedRevision,
      })
      return Promise.resolve(
        repository.rename(
          TEST_USER_ID,
          input.id,
          input.title,
          input.expectedRevision,
        ),
      )
    },
  }),
  useSaveAgentThreadSnapshot: () => ({
    mutateAsync: (input: {
      id: string
      snapshot: Parameters<AgentThreadRepository["saveSnapshot"]>[2]
      expectedRevision?: number
    }) => {
      harness.expectedRevisions.push({
        operation: "snapshot",
        revision: input.expectedRevision,
      })
      return Promise.resolve(
        repository.saveSnapshot(
          TEST_USER_ID,
          input.id,
          input.snapshot,
          input.expectedRevision,
        ),
      )
    },
  }),
  useSetActiveAgentThread: () => ({
    mutateAsync: (input: { id?: string }) =>
      Promise.resolve(repository.setActive(TEST_USER_ID, input.id)),
  }),
}))

vi.mock("@/lib/agent-session-binding", () => ({
  getAgentSessionBindingProof: vi.fn(() =>
    Promise.resolve("signed-session-binding"),
  ),
  getAgentParticipantSessionBindingProof: vi.fn(
    (input: {
      participantThreadIds: readonly string[]
      targetThreadId: string
    }) => {
      harness.participantProofRequests.push(input)
      return Promise.resolve({
        channel: {
          channelId: `agent-channel:${input.participantThreadIds.join("+")}`,
          ownerPrincipalId: TEST_USER_ID,
          participants: [],
        },
        expiresAt: Date.now() + 60_000,
        proof: `signed-participant-binding:${input.targetThreadId}`,
        subject: TEST_USER_ID,
        targetParticipantId: `persona:${input.targetThreadId}`,
        threadId: input.targetThreadId,
      })
    },
  ),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  repository = createRepository()
  harness.eveCallbacks = null
  harness.nextSnapshot = null
  harness.session = null
  harness.participantChannel = null
  harness.participantProofRequests = []
  harness.eveSessions = new Map()
  harness.eveRuntimeMountCount = 0
  harness.eveRuntimeSequence = 0
  harness.expectedRevisions = []
  harness.sendResult = null
  harness.pendingSend = null
  harness.eveSendCallCount = 0
  harness.lastEveSendInput = null
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("AppAgentSessions persistence call site", () => {
  it("surfaces a competing-writer conflict and does not consume dependent state", async () => {
    const thread = createForkedConversation()
    await renderSessions()

    repository.rename(
      TEST_USER_ID,
      thread.id,
      "Changed by another writer",
      thread.revision,
    )

    await act(async () => {
      harness.nextSnapshot = snapshot(1)
      await harness.session?.send({
        message: "Continue the fork",
      })
      await Promise.resolve()
    })

    expect(harness.expectedRevisions).toEqual([
      { operation: "snapshot", revision: thread.revision },
    ])
    expect(harness.lastEveSendInput?.headers).toMatchObject({
      "x-sigil-persona-id": "agent-a",
      "x-sigil-session-binding": "signed-session-binding",
    })
    expect(repository.get(TEST_USER_ID, thread.id)).toMatchObject({
      forkSeed: thread.forkSeed,
      revision: thread.revision + 1,
      title: "Changed by another writer",
    })
    expect(container.textContent).toContain("Agent session was not saved")
    expect(container.textContent).toContain(
      `changed from revision ${thread.revision} to ${thread.revision + 1}`,
    )
  })

  it("treats duplicate final-snapshot delivery as an idempotent replay", async () => {
    const thread = createForkedConversation()
    const finalSnapshot = snapshot(2)
    await renderSessions()

    repository.saveSnapshot(
      TEST_USER_ID,
      thread.id,
      {
        events: [...finalSnapshot.events],
        session: finalSnapshot.session,
      },
      thread.revision,
    )

    await act(async () => {
      harness.nextSnapshot = finalSnapshot
      await harness.session?.send({
        message: "Name the rollback owner",
      })
    })

    expect(harness.expectedRevisions).toEqual([
      { operation: "snapshot", revision: thread.revision },
      { operation: "consume", revision: thread.revision + 1 },
      { operation: "rename", revision: thread.revision + 2 },
    ])
    expect(repository.get(TEST_USER_ID, thread.id)).toMatchObject({
      revision: thread.revision + 3,
      title: "Name the rollback owner",
    })
    expect(container.textContent).not.toContain("Agent session was not saved")
  })

  it("chains one final snapshot through seed consumption and rename without a false conflict", async () => {
    const thread = createForkedConversation()
    await renderSessions()

    await act(async () => {
      harness.nextSnapshot = snapshot(2)
      await harness.session?.send({
        headers: { "x-sigil-persona-id": "agent-b" },
        message: "Name the rollback owner",
      })
    })

    expect(harness.expectedRevisions).toEqual([
      { operation: "snapshot", revision: thread.revision },
      { operation: "consume", revision: thread.revision + 1 },
      { operation: "rename", revision: thread.revision + 2 },
    ])
    expect(repository.get(TEST_USER_ID, thread.id)).toMatchObject({
      revision: thread.revision + 3,
      title: "Name the rollback owner",
    })
    expect(repository.get(TEST_USER_ID, thread.id)?.forkSeed).toBeUndefined()
    expect(container.textContent).not.toContain("Agent session was not saved")
  })

  it("does not consume the fork seed or rename on a failed turn, and retries cleanly", async () => {
    const thread = createForkedConversation()
    await renderSessions()

    harness.sendResult = {
      status: "failed",
      error: { message: "The model backend returned an error." },
    }

    await act(async () => {
      const result = await harness.session?.send({ message: "Try the fork" })
      expect(result).toMatchObject({ status: "failed" })
    })

    expect(harness.expectedRevisions).toEqual([])
    expect(repository.get(TEST_USER_ID, thread.id)).toMatchObject({
      forkSeed: thread.forkSeed,
      revision: thread.revision,
      title: thread.title,
    })

    harness.sendResult = null

    await act(async () => {
      const result = await harness.session?.send({ message: "Retry the fork" })
      expect(result).toMatchObject({ status: "succeeded" })
    })

    expect(
      harness.expectedRevisions.filter(
        (entry) => entry.operation === "consume",
      ),
    ).toHaveLength(1)
    expect(repository.get(TEST_USER_ID, thread.id)?.forkSeed).toBeUndefined()
  })

  it("rejects an overlapping send before it reaches Eve, then allows a subsequent send once the turn clears", async () => {
    repository.create(TEST_USER_ID, { title: "Fixed title" })
    await renderSessions()

    let resolveFirstSend: ((result: AgentTurnResult) => void) | undefined
    harness.pendingSend = new Promise<AgentTurnResult>((resolve) => {
      resolveFirstSend = resolve
    })

    let firstSendPromise: Promise<AgentTurnResult> | undefined
    await act(async () => {
      firstSendPromise = harness.session?.send({ message: "First" })
      // Let the async `send` run past its synchronous prefix (where the
      // turnActive ref flips true) without waiting on the still-pending Eve
      // call.
      await Promise.resolve()
    })

    expect(harness.eveSendCallCount).toBe(1)

    await act(async () => {
      const secondResult = await harness.session?.send({ message: "Second" })
      expect(secondResult).toMatchObject({
        status: "failed",
        error: {
          message: "The agent session is already processing a turn.",
        },
      })
    })

    expect(harness.eveSendCallCount).toBe(1)

    await act(async () => {
      resolveFirstSend?.({ status: "succeeded" })
      harness.pendingSend = null
      await firstSendPromise
    })

    await act(async () => {
      const thirdResult = await harness.session?.send({ message: "Third" })
      expect(thirdResult).toMatchObject({ status: "succeeded" })
    })

    expect(harness.eveSendCallCount).toBe(2)
  })

  it("routes participant channel sends to independent Eve sessions with per-target binding proofs", async () => {
    repository.create(TEST_USER_ID, { title: "Coordinator" })
    const a = createConversationWithSession("agent-a", "eve-a")
    const b = createConversationWithSession("agent-b", "eve-b")
    const c = createConversationWithSession("agent-c", "eve-c")
    const participantThreadIds = [a.id, b.id, c.id]

    await renderSessions({
      children: createElement(ParticipantChannelCapture),
      participantThreadIds,
    })
    const channel = await waitForParticipantChannel()

    await act(async () => {
      await channel.dispatch({
        targetParticipantId: participantIdForThread(a.id),
        message: "Ask A",
      })
      await channel.dispatch({
        targetParticipantId: participantIdForThread(b.id),
        message: "Ask B",
      })
    })

    expect(sessionById("eve-a").sent).toHaveLength(1)
    expect(sessionById("eve-b").sent).toHaveLength(1)
    expect(sessionById("eve-c").sent).toHaveLength(0)
    expect(sessionById("eve-a").sent[0]).toMatchObject({
      message: "Ask A",
      headers: {
        "x-sigil-persona-id": "agent-a",
        "x-sigil-session-binding": `signed-participant-binding:${a.id}`,
      },
    })
    expect(sessionById("eve-b").sent[0]).toMatchObject({
      message: "Ask B",
      headers: {
        "x-sigil-persona-id": "agent-b",
        "x-sigil-session-binding": `signed-participant-binding:${b.id}`,
      },
    })
    expect(harness.participantProofRequests).toEqual([
      { participantThreadIds, targetThreadId: a.id },
      { participantThreadIds, targetThreadId: b.id },
    ])
    expect(channel.sentCount(participantIdForThread(a.id))).toBe(1)
    expect(channel.sentCount(participantIdForThread(b.id))).toBe(1)
    expect(channel.sentCount(participantIdForThread(c.id))).toBe(0)
    await act(async () => {
      await flush()
    })
    expect(
      requireParticipantChannel().events.filter(
        (event) => event.type === "participant.dispatch",
      ),
    ).toHaveLength(2)
  })

  it("routes unsessioned participant threads by participant identity instead of the pending Eve id", async () => {
    const coordinator = repository.create(TEST_USER_ID, {
      title: "Coordinator",
    })
    const a = createConversationWithoutSession("agent-a")
    const b = createConversationWithoutSession("agent-b")
    repository.setActive(TEST_USER_ID, coordinator.id)
    const participantThreadIds = [a.id, b.id]

    await renderSessions({
      children: createElement(ParticipantChannelCapture),
      participantThreadIds,
    })
    const channel = await waitForParticipantChannel()

    await act(async () => {
      await channel.dispatch({
        targetParticipantId: participantIdForThread(a.id),
        message: "Ask A",
      })
    })

    const participantSessions = [...harness.eveSessions.values()].filter(
      (session) => !session.primary,
    )
    expect(participantSessions).toHaveLength(2)
    const sentSessions = participantSessions.filter(
      (session) => session.sent.length > 0,
    )
    expect(sentSessions).toHaveLength(1)
    expect(sentSessions[0]?.sent[0]).toMatchObject({
      message: "Ask A",
      headers: {
        "x-sigil-persona-id": "agent-a",
        "x-sigil-session-binding": `signed-participant-binding:${a.id}`,
      },
    })
    expect(
      requireParticipantChannel().sentCount(participantIdForThread(a.id)),
    ).toBe(1)
    expect(
      requireParticipantChannel().sentCount(participantIdForThread(b.id)),
    ).toBe(0)
  })

  it("reuses the primary active session when the active thread is a participant", async () => {
    const active = repository.create(TEST_USER_ID, {
      personaId: "agent-a",
      title: "Active",
    })
    const peer = createConversationWithSession("agent-b", "eve-b")
    repository.setActive(TEST_USER_ID, active.id)

    await renderSessions({
      children: createElement(ParticipantChannelCapture),
      participantThreadIds: [active.id, peer.id],
    })
    const channel = await waitForParticipantChannel()

    expect(harness.eveRuntimeMountCount).toBe(2)

    await act(async () => {
      await channel.dispatch({
        targetParticipantId: participantIdForThread(active.id),
        message: "Ask active",
      })
    })

    expect(harness.eveSendCallCount).toBe(1)
    expect(harness.lastEveSendInput).toMatchObject({
      message: "Ask active",
      headers: {
        "x-sigil-persona-id": "agent-a",
        "x-sigil-session-binding": `signed-participant-binding:${active.id}`,
      },
    })
    expect(sessionById("eve-b").sent).toHaveLength(0)
  })

  it("interrupts only the addressed participant session before dispatching the replacement turn", async () => {
    repository.create(TEST_USER_ID, { title: "Coordinator" })
    const a = createConversationWithSession("agent-a", "eve-a")
    const b = createConversationWithSession("agent-b", "eve-b")

    await renderSessions({
      children: createElement(ParticipantChannelCapture),
      participantThreadIds: [a.id, b.id],
    })
    const channel = await waitForParticipantChannel()
    const eveA = sessionById("eve-a")
    const eveB = sessionById("eve-b")
    const holdA = deferredTurn()
    const holdB = deferredTurn()
    eveA.pendingSend = holdA.promise
    eveB.pendingSend = holdB.promise

    let firstA: Promise<AgentTurnResult> | undefined
    let firstB: Promise<AgentTurnResult> | undefined
    await act(async () => {
      firstA = channel.dispatch({
        targetParticipantId: participantIdForThread(a.id),
        message: "First A",
      })
      firstB = channel.dispatch({
        targetParticipantId: participantIdForThread(b.id),
        message: "First B",
      })
      await flush()
    })
    const latestChannel = requireParticipantChannel()

    const observedA = eveA.activeTurnId
    expect(observedA).toBeTruthy()
    expect(eveB.activeTurnId).toBeTruthy()

    let replacement: Promise<AgentTurnResult> | undefined
    await act(async () => {
      replacement = latestChannel.interrupt({
        targetParticipantId: participantIdForThread(a.id),
        message: "Replacement A",
        reason: "coordinator redirected A",
      })
      await flush()
    })

    expect(eveA.cancelTurnIds).toEqual([observedA])
    expect(eveB.cancelTurnIds).toEqual([])
    expect(eveA.sent.map((input) => input.message)).toEqual(["First A"])

    await act(async () => {
      eveB.pendingSend = null
      holdB.resolve({ status: "succeeded" })
      await firstB
      await flush()
    })
    expect(eveA.sent.map((input) => input.message)).toEqual(["First A"])

    await act(async () => {
      eveA.pendingSend = null
      holdA.resolve({ status: "cancelled" })
      await flush()
    })
    expect(eveA.sent.map((input) => input.message)).toEqual([
      "First A",
      "Replacement A",
    ])

    await act(async () => {
      await firstA
      await replacement
    })

    expect(eveB.sent.map((input) => input.message)).toEqual(["First B"])
  })

  it("records participant provenance for messages, tool calls, domain outcomes, and context receipts", async () => {
    repository.create(TEST_USER_ID, { title: "Coordinator" })
    const participant = createConversationWithSession("agent-a", "eve-a")
    const peer = createConversationWithSession("agent-b", "eve-b")
    seedContextReceipt(participant.id)

    await renderSessions({
      children: createElement(ParticipantChannelCapture),
      participantThreadIds: [participant.id, peer.id],
    })
    await waitForParticipantChannel()
    const eveA = sessionById("eve-a")

    await act(async () => {
      eveA.callbacks.onEvent?.({
        type: "message.completed",
        data: {
          finishReason: "stop",
          message: "A visible reply",
          sequence: 1,
          stepIndex: 0,
          turnId: "turn-a",
        },
      } as AgentRuntimeStreamEvent)
      eveA.callbacks.onEvent?.({
        type: "actions.requested",
        data: {
          actions: [
            {
              callId: "tool-call-a",
              input: { id: "resource-a" },
              kind: "tool-call",
              toolName: "sigil-test-tool",
            },
          ],
          sequence: 2,
          stepIndex: 0,
          turnId: "turn-a",
        },
      } as AgentRuntimeStreamEvent)
      eveA.callbacks.onEvent?.({
        type: "action.result",
        data: {
          result: {
            callId: "tool-call-a",
            kind: "tool-result",
            output: {
              type: "agent.domain.outcome",
              payload: {
                id: "outcome-a",
                kind: "test.changed",
                operation: "updated",
                resource: { id: "resource-a", kind: "test.resource" },
              },
            },
            toolName: "sigil-test-tool",
          },
          sequence: 3,
          status: "completed",
          stepIndex: 0,
          turnId: "turn-a",
        },
      } as AgentRuntimeStreamEvent)
      await flush()
    })

    const envelopes = requireParticipantChannel().events.flatMap((event) =>
      event.type === "participant.envelope" ? [event.envelope] : [],
    )
    expect(envelopes.map((event) => event.subject)).toEqual(
      expect.arrayContaining([
        "context-contribution",
        "domain-outcome",
        "message",
        "tool-call",
        "tool-result",
      ]),
    )
    for (const envelope of envelopes) {
      expect(envelope.provenance).toMatchObject({
        applicationThreadId: participant.id,
        runtimeSessionId: "eve-a",
        participantId: participantIdForThread(participant.id),
        personaId: "agent-a",
      })
    }
    expect(
      envelopes.find((event) => event.subject === "domain-outcome")?.payload,
    ).toMatchObject({
      payload: {
        id: "outcome-a",
      },
      type: "agent.domain.outcome",
    })
  })
})

async function renderSessions({
  children = createElement(SessionCapture),
  participantThreadIds,
}: {
  children?: ReactNode
  participantThreadIds?: readonly string[]
} = {}): Promise<void> {
  await act(() => {
    root.render(
      createElement(AppAgentSessions, {
        children,
        participantChannel: participantThreadIds
          ? { threadIds: participantThreadIds }
          : undefined,
        principalId: TEST_USER_ID,
      }),
    )
  })
  expect(harness.eveCallbacks).not.toBeNull()
  expect(harness.session).not.toBeNull()
}

function SessionCapture() {
  harness.session = useAgentRuntimeSession()
  return createElement("div", null, "Agent child")
}

function ParticipantChannelCapture() {
  harness.participantChannel = useAgentParticipantChannel()
  return createElement(SessionCapture)
}

function createForkedConversation(): AgentThread {
  const source = repository.create(TEST_USER_ID, {
    title: "Source conversation",
  })
  return repository.fork(TEST_USER_ID, {
    sourceThreadId: source.id,
    title: "New conversation",
    expectedRevision: source.revision,
  })
}

function createConversationWithSession(
  personaId: string,
  sessionId: string,
): AgentThread {
  const thread = repository.create(TEST_USER_ID, {
    personaId,
    title: personaId,
  })
  repository.saveSnapshot(
    TEST_USER_ID,
    thread.id,
    { events: [], session: { streamIndex: 0, sessionId } },
    thread.revision,
  )
  return repository.get(TEST_USER_ID, thread.id)!
}

function createConversationWithoutSession(personaId: string): AgentThread {
  return repository.create(TEST_USER_ID, {
    personaId,
    title: personaId,
  })
}

function seedContextReceipt(threadId: string): void {
  const thread = repository.get(TEST_USER_ID, threadId)
  if (!thread) throw new Error(`Missing thread ${threadId}`)
  threadStore.set(`thread:${threadId}`, {
    ...thread,
    contextReceipts: [
      {
        applicationThreadId: threadId,
        compiledAt: "2026-07-16T20:00:00.000Z",
        principalId: TEST_USER_ID,
        recordId: "receipt-a",
        retainedAt: "2026-07-16T20:00:01.000Z",
        personaId: thread.personaId,
        receipt: {
          audience: "model",
          compiledAt: "2026-07-16T20:00:00.000Z",
          compiler: { configVersion: "test", version: "test" },
          dropped: [],
          id: "receipt-a",
          maxTokens: 128,
          pinned: [],
          selected: [
            {
              activationReason: "test receipt",
              kind: "selected",
              pinned: false,
              provenance: { contributorId: "test" },
              tokenEstimate: { estimatedTokens: 8, quality: "exact" },
              visibility: { decision: "visible", reason: "test" },
            },
          ],
          status: "ready",
          totalTokens: 8,
          version: 1,
        },
        turnId: "turn-a",
      },
    ],
  })
}

function sessionById(sessionId: string): MockEveSession {
  const session = harness.eveSessions.get(sessionId)
  if (!session) throw new Error(`Missing mocked Eve session ${sessionId}`)
  return session
}

async function waitForParticipantChannel(): Promise<AgentParticipantChannelValue> {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await flush()
    })
    if (harness.participantChannel) return harness.participantChannel
  }
  throw new Error("Participant channel was not mounted.")
}

function requireParticipantChannel(): AgentParticipantChannelValue {
  if (!harness.participantChannel) {
    throw new Error("Participant channel was not mounted.")
  }
  return harness.participantChannel
}

function deferredTurn(): {
  promise: Promise<AgentTurnResult>
  resolve: (result: AgentTurnResult) => void
} {
  let resolve: (result: AgentTurnResult) => void = () => undefined
  const promise = new Promise<AgentTurnResult>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function snapshot(streamIndex: number): AgentAdapterSnapshot {
  return {
    data: { messages: [] },
    error: undefined,
    events: [],
    session: { streamIndex },
    status: "ready",
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function createRepository(): AgentThreadRepository {
  threadStore = memoryStore<AgentThread>()
  return new AgentThreadRepository({
    defaultPersonaId: "agent-a",
    createId: (() => {
      let id = 0
      return () => `thread-${++id}`
    })(),
    now: (() => {
      let tick = 0
      return () => new Date(Date.UTC(2026, 6, 16, 20, 0, tick++))
    })(),
    preferences: memoryStore<AgentThreadPreference>(),
    threads: threadStore,
  })
}

type TestAgentThreadKvStore<T> = AgentThreadKvStore<T> & {
  readonly raw: Map<string, T>
}

function memoryStore<T>(): TestAgentThreadKvStore<T> {
  const values = new Map<string, T>()
  return {
    raw: values,
    delete: (key) => {
      values.delete(key)
    },
    entries: (prefix = "") =>
      [...values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value: structuredClone(value) })),
    get: (key) => {
      const value = values.get(key)
      return value === undefined ? undefined : structuredClone(value)
    },
    set: (key, value) => {
      values.set(key, structuredClone(value))
    },
  }
}
