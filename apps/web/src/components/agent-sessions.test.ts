// @vitest-environment jsdom

import { act, createElement } from "react";
import * as ReactRuntime from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseEveRuntimeSessionOptions } from "@zigil/agent-eve";
import { useAgentRuntimeSession } from "@zigil/agent-react/session";
import type {
  AgentRuntimeSession,
  AgentTurnResult,
} from "@zigil/agent-surface/contracts";

import { AppAgentSessions } from "./agent-sessions";
import {
  AgentThreadRepository,
  type AgentThread,
  type AgentThreadKvStore,
  type AgentThreadPreference,
} from "@/lib/agent-threads-domain";

// Vitest externalizes the published source package before the React plugin can
// apply the automatic JSX transform. The application build does not.
Object.assign(globalThis, { React: ReactRuntime });

type AgentAdapterSnapshot = Parameters<
  NonNullable<UseEveRuntimeSessionOptions["onFinish"]>
>[0];

type EveCallbacks = {
  onFinish?: (snapshot: AgentAdapterSnapshot) => void;
};

const harness = vi.hoisted(() => ({
  eveCallbacks: null as EveCallbacks | null,
  nextSnapshot: null as AgentAdapterSnapshot | null,
  session: null as AgentRuntimeSession | null,
  expectedRevisions: [] as Array<{
    operation: "consume" | "rename" | "snapshot";
    revision: number | undefined;
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
}));

let repository: AgentThreadRepository;
const TEST_USER_ID = "session-test-user";

vi.mock("@zigil/agent-eve", () => ({
  useEveRuntimeSession: (callbacks: EveCallbacks) => {
    harness.eveCallbacks = callbacks;
    return {
      capabilities: { reset: true, stop: true, streaming: true },
      data: { messages: [] },
      status: "idle",
      send: (input: { headers?: Record<string, string> }) => {
        harness.eveSendCallCount += 1;
        harness.lastEveSendInput = input;
        if (harness.pendingSend) return harness.pendingSend;
        if (harness.nextSnapshot) callbacks.onFinish?.(harness.nextSnapshot);
        return Promise.resolve(
          harness.sendResult ?? { status: "succeeded" as const },
        );
      },
      reset: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

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
      });
      return Promise.resolve(
        repository.consumeForkSeed(
          TEST_USER_ID,
          input.id,
          input.expectedRevision,
        ),
      );
    },
  }),
  useCreateAgentThread: () => ({
    mutateAsync: (input: { personaId?: string; title?: string }) =>
      Promise.resolve(repository.create(TEST_USER_ID, input)),
  }),
  useForkAgentThread: () => ({
    mutateAsync: (input: {
      sourceThreadId: string;
      expectedRevision?: number;
    }) => Promise.resolve(repository.fork(TEST_USER_ID, input)),
  }),
  useRenameAgentThread: () => ({
    mutateAsync: (input: {
      id: string;
      title: string;
      expectedRevision?: number;
    }) => {
      harness.expectedRevisions.push({
        operation: "rename",
        revision: input.expectedRevision,
      });
      return Promise.resolve(
        repository.rename(
          TEST_USER_ID,
          input.id,
          input.title,
          input.expectedRevision,
        ),
      );
    },
  }),
  useSaveAgentThreadSnapshot: () => ({
    mutateAsync: (input: {
      id: string;
      snapshot: Parameters<AgentThreadRepository["saveSnapshot"]>[2];
      expectedRevision?: number;
    }) => {
      harness.expectedRevisions.push({
        operation: "snapshot",
        revision: input.expectedRevision,
      });
      return Promise.resolve(
        repository.saveSnapshot(
          TEST_USER_ID,
          input.id,
          input.snapshot,
          input.expectedRevision,
        ),
      );
    },
  }),
  useSetActiveAgentThread: () => ({
    mutateAsync: (input: { id?: string }) =>
      Promise.resolve(repository.setActive(TEST_USER_ID, input.id)),
  }),
}));

vi.mock("@/lib/agent-session-binding", () => ({
  getAgentSessionBindingProof: vi.fn(() =>
    Promise.resolve("signed-session-binding"),
  ),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  repository = createRepository();
  harness.eveCallbacks = null;
  harness.nextSnapshot = null;
  harness.session = null;
  harness.expectedRevisions = [];
  harness.sendResult = null;
  harness.pendingSend = null;
  harness.eveSendCallCount = 0;
  harness.lastEveSendInput = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppAgentSessions persistence call site", () => {
  it("surfaces a competing-writer conflict and does not consume dependent state", async () => {
    const thread = createForkedConversation();
    await renderSessions();

    repository.rename(
      TEST_USER_ID,
      thread.id,
      "Changed by another writer",
      thread.revision,
    );

    await act(async () => {
      harness.nextSnapshot = snapshot(1);
      await harness.session?.send({
        message: "Continue the fork",
      });
      await Promise.resolve();
    });

    expect(harness.expectedRevisions).toEqual([
      { operation: "snapshot", revision: thread.revision },
    ]);
    expect(harness.lastEveSendInput?.headers).toMatchObject({
      "x-sigil-persona-id": "agent-a",
      "x-sigil-session-binding": "signed-session-binding",
    });
    expect(repository.get(TEST_USER_ID, thread.id)).toMatchObject({
      forkSeed: thread.forkSeed,
      revision: thread.revision + 1,
      title: "Changed by another writer",
    });
    expect(container.textContent).toContain("Agent session was not saved");
    expect(container.textContent).toContain(
      `changed from revision ${thread.revision} to ${thread.revision + 1}`,
    );
  });

  it("chains one final snapshot through seed consumption and rename without a false conflict", async () => {
    const thread = createForkedConversation();
    await renderSessions();

    await act(async () => {
      harness.nextSnapshot = snapshot(2);
      await harness.session?.send({
        headers: { "x-sigil-persona-id": "agent-b" },
        message: "Name the rollback owner",
      });
    });

    expect(harness.expectedRevisions).toEqual([
      { operation: "snapshot", revision: thread.revision },
      { operation: "consume", revision: thread.revision + 1 },
      { operation: "rename", revision: thread.revision + 2 },
    ]);
    expect(repository.get(TEST_USER_ID, thread.id)).toMatchObject({
      revision: thread.revision + 3,
      title: "Name the rollback owner",
    });
    expect(repository.get(TEST_USER_ID, thread.id)?.forkSeed).toBeUndefined();
    expect(container.textContent).not.toContain("Agent session was not saved");
  });

  it("does not consume the fork seed or rename on a failed turn, and retries cleanly", async () => {
    const thread = createForkedConversation();
    await renderSessions();

    harness.sendResult = {
      status: "failed",
      error: { message: "The model backend returned an error." },
    };

    await act(async () => {
      const result = await harness.session?.send({ message: "Try the fork" });
      expect(result).toMatchObject({ status: "failed" });
    });

    expect(harness.expectedRevisions).toEqual([]);
    expect(repository.get(TEST_USER_ID, thread.id)).toMatchObject({
      forkSeed: thread.forkSeed,
      revision: thread.revision,
      title: thread.title,
    });

    harness.sendResult = null;

    await act(async () => {
      const result = await harness.session?.send({ message: "Retry the fork" });
      expect(result).toMatchObject({ status: "succeeded" });
    });

    expect(
      harness.expectedRevisions.filter(
        (entry) => entry.operation === "consume",
      ),
    ).toHaveLength(1);
    expect(repository.get(TEST_USER_ID, thread.id)?.forkSeed).toBeUndefined();
  });

  it("rejects an overlapping send before it reaches Eve, then allows a subsequent send once the turn clears", async () => {
    repository.create(TEST_USER_ID, { title: "Fixed title" });
    await renderSessions();

    let resolveFirstSend: ((result: AgentTurnResult) => void) | undefined;
    harness.pendingSend = new Promise<AgentTurnResult>((resolve) => {
      resolveFirstSend = resolve;
    });

    let firstSendPromise: Promise<AgentTurnResult> | undefined;
    await act(async () => {
      firstSendPromise = harness.session?.send({ message: "First" });
      // Let the async `send` run past its synchronous prefix (where the
      // turnActive ref flips true) without waiting on the still-pending Eve
      // call.
      await Promise.resolve();
    });

    expect(harness.eveSendCallCount).toBe(1);

    await act(async () => {
      const secondResult = await harness.session?.send({ message: "Second" });
      expect(secondResult).toMatchObject({
        status: "failed",
        error: {
          message: "The agent session is already processing a turn.",
        },
      });
    });

    expect(harness.eveSendCallCount).toBe(1);

    await act(async () => {
      resolveFirstSend?.({ status: "succeeded" });
      harness.pendingSend = null;
      await firstSendPromise;
    });

    await act(async () => {
      const thirdResult = await harness.session?.send({ message: "Third" });
      expect(thirdResult).toMatchObject({ status: "succeeded" });
    });

    expect(harness.eveSendCallCount).toBe(2);
  });
});

async function renderSessions(): Promise<void> {
  await act(() => {
    root.render(
      createElement(AppAgentSessions, null, createElement(SessionCapture)),
    );
  });
  expect(harness.eveCallbacks).not.toBeNull();
  expect(harness.session).not.toBeNull();
}

function SessionCapture() {
  harness.session = useAgentRuntimeSession();
  return createElement("div", null, "Agent child");
}

function createForkedConversation(): AgentThread {
  const source = repository.create(TEST_USER_ID, {
    title: "Source conversation",
  });
  return repository.fork(TEST_USER_ID, {
    sourceThreadId: source.id,
    title: "New conversation",
    expectedRevision: source.revision,
  });
}

function snapshot(streamIndex: number): AgentAdapterSnapshot {
  return {
    data: { messages: [] },
    error: undefined,
    events: [],
    session: { streamIndex },
    status: "ready",
  };
}

function createRepository(): AgentThreadRepository {
  return new AgentThreadRepository({
    defaultPersonaId: "agent-a",
    createId: (() => {
      let id = 0;
      return () => `thread-${++id}`;
    })(),
    now: (() => {
      let tick = 0;
      return () => new Date(Date.UTC(2026, 6, 16, 20, 0, tick++));
    })(),
    preferences: memoryStore<AgentThreadPreference>(),
    threads: memoryStore<AgentThread>(),
  });
}

function memoryStore<T>(): AgentThreadKvStore<T> {
  const values = new Map<string, T>();
  return {
    delete: (key) => {
      values.delete(key);
    },
    entries: (prefix = "") =>
      [...values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value: structuredClone(value) })),
    get: (key) => {
      const value = values.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    set: (key, value) => {
      values.set(key, structuredClone(value));
    },
  };
}
