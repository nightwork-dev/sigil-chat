// @vitest-environment jsdom

import { act, createElement } from "react"
import * as ReactRuntime from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { EveAgentStoreSnapshot } from "eve/client"
import type { EveMessageData } from "eve/react"
import {
  useAgentRuntimeSession,
  type AgentRuntimeSession,
  type AgentTurnResult,
} from "@sigil/agent"

import { AppAgentSessions } from "./agent-sessions"
import {
  AgentThreadRepository,
  type AgentThread,
  type AgentThreadKvStore,
  type AgentThreadPreference,
} from "@/lib/agent-threads-domain"

// Vitest externalizes the published source package before the React plugin can
// apply the automatic JSX transform. The application build does not.
Object.assign(globalThis, { React: ReactRuntime })

type EveCallbacks = {
  onFinish?: (snapshot: EveAgentStoreSnapshot<EveMessageData>) => void
}

const harness = vi.hoisted(() => ({
  eveCallbacks: null as EveCallbacks | null,
  nextSnapshot: null as EveAgentStoreSnapshot<EveMessageData> | null,
  session: null as AgentRuntimeSession | null,
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
}))

let repository: AgentThreadRepository

vi.mock("@sigil/agent-eve", () => ({
  useEveRuntimeSession: (callbacks: EveCallbacks) => {
    harness.eveCallbacks = callbacks
    return {
      capabilities: { reset: true, stop: true, streaming: true },
      data: { messages: [] },
      status: "idle",
      send: () => {
        harness.eveSendCallCount += 1
        if (harness.pendingSend) return harness.pendingSend
        if (harness.nextSnapshot) callbacks.onFinish?.(harness.nextSnapshot)
        return Promise.resolve(harness.sendResult ?? { status: "succeeded" as const })
      },
      reset: vi.fn(),
      stop: vi.fn(),
    }
  },
}))

vi.mock("@/lib/agent-threads", () => ({
  useActiveAgentThreadPreference: () => ({
    data: repository.getActivePreference(),
    isError: false,
    isPending: false,
  }),
  useAgentThread: (id: string | undefined) => ({
    data: id ? repository.get(id) : undefined,
    isError: false,
    isPending: false,
  }),
  useAgentThreads: () => ({
    data: repository.list(),
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
        repository.consumeForkSeed(input.id, input.expectedRevision),
      )
    },
  }),
  useCreateAgentThread: () => ({
    mutateAsync: (input: { title?: string }) =>
      Promise.resolve(repository.create(input)),
  }),
  useForkAgentThread: () => ({
    mutateAsync: (input: {
      sourceThreadId: string
      expectedRevision?: number
    }) => Promise.resolve(repository.fork(input)),
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
        repository.rename(input.id, input.title, input.expectedRevision),
      )
    },
  }),
  useSaveAgentThreadSnapshot: () => ({
    mutateAsync: (input: {
      id: string
      snapshot: Parameters<AgentThreadRepository["saveSnapshot"]>[1]
      expectedRevision?: number
    }) => {
      harness.expectedRevisions.push({
        operation: "snapshot",
        revision: input.expectedRevision,
      })
      return Promise.resolve(
        repository.saveSnapshot(
          input.id,
          input.snapshot,
          input.expectedRevision,
        ),
      )
    },
  }),
  useSetActiveAgentThread: () => ({
    mutateAsync: (input: { id?: string }) =>
      Promise.resolve(repository.setActive(input.id)),
  }),
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
  harness.expectedRevisions = []
  harness.sendResult = null
  harness.pendingSend = null
  harness.eveSendCallCount = 0
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

    repository.rename(thread.id, "Changed by another writer", thread.revision)

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
    expect(repository.get(thread.id)).toMatchObject({
      forkSeed: thread.forkSeed,
      revision: thread.revision + 1,
      title: "Changed by another writer",
    })
    expect(container.textContent).toContain("Agent session was not saved")
    expect(container.textContent).toContain(
      `changed from revision ${thread.revision} to ${thread.revision + 1}`,
    )
  })

  it("chains one final snapshot through seed consumption and rename without a false conflict", async () => {
    const thread = createForkedConversation()
    await renderSessions()

    await act(async () => {
      harness.nextSnapshot = snapshot(2)
      await harness.session?.send({
        message: "Name the rollback owner",
      })
    })

    expect(harness.expectedRevisions).toEqual([
      { operation: "snapshot", revision: thread.revision },
      { operation: "consume", revision: thread.revision + 1 },
      { operation: "rename", revision: thread.revision + 2 },
    ])
    expect(repository.get(thread.id)).toMatchObject({
      revision: thread.revision + 3,
      title: "Name the rollback owner",
    })
    expect(repository.get(thread.id)?.forkSeed).toBeUndefined()
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
    expect(repository.get(thread.id)).toMatchObject({
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
      harness.expectedRevisions.filter((entry) => entry.operation === "consume"),
    ).toHaveLength(1)
    expect(repository.get(thread.id)?.forkSeed).toBeUndefined()
  })

  it("rejects an overlapping send before it reaches Eve, then allows a subsequent send once the turn clears", async () => {
    repository.create({ title: "Fixed title" })
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
})

async function renderSessions(): Promise<void> {
  await act(() => {
    root.render(
      createElement(AppAgentSessions, null, createElement(SessionCapture)),
    )
  })
  expect(harness.eveCallbacks).not.toBeNull()
  expect(harness.session).not.toBeNull()
}

function SessionCapture() {
  harness.session = useAgentRuntimeSession()
  return createElement("div", null, "Agent child")
}

function createForkedConversation(): AgentThread {
  const source = repository.create({ title: "Source conversation" })
  return repository.fork({
    sourceThreadId: source.id,
    title: "New conversation",
    expectedRevision: source.revision,
  })
}

function snapshot(streamIndex: number): EveAgentStoreSnapshot<EveMessageData> {
  return {
    data: { messages: [] },
    error: undefined,
    events: [],
    session: { streamIndex },
    status: "ready",
  }
}

function createRepository(): AgentThreadRepository {
  return new AgentThreadRepository({
    createId: (() => {
      let id = 0
      return () => `thread-${++id}`
    })(),
    now: (() => {
      let tick = 0
      return () => new Date(Date.UTC(2026, 6, 16, 20, 0, tick++))
    })(),
    preferences: memoryStore<AgentThreadPreference>(),
    threads: memoryStore<AgentThread>(),
  })
}

function memoryStore<T>(): AgentThreadKvStore<T> {
  const values = new Map<string, T>()
  return {
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
