import { describe, expect, it } from "vitest";
import type { HandleMessageStreamEvent } from "eve/client";

import {
  AgentThreadConflictError,
  AgentThreadRepository,
  projectAgentThreadSummary,
  type AgentThreadKvStore,
} from "./agent-threads-domain";

class MemoryKv<T> implements AgentThreadKvStore<T> {
  private readonly values = new Map<string, T>();

  delete(key: string): void {
    this.values.delete(key);
  }

  get(key: string): T | undefined {
    const value = this.values.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  set(key: string, value: T): void {
    this.values.set(key, structuredClone(value));
  }

  entries(prefix = ""): Array<{ key: string; value: T }> {
    return [...this.values.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ key, value: structuredClone(value) }));
  }
}

function repository() {
  const timestamps = [
    "2026-07-16T10:00:00.000Z",
    "2026-07-16T10:01:00.000Z",
    "2026-07-16T10:02:00.000Z",
    "2026-07-16T10:03:00.000Z",
    "2026-07-16T10:04:00.000Z",
    "2026-07-16T10:05:00.000Z",
    "2026-07-16T10:06:00.000Z",
    "2026-07-16T10:07:00.000Z",
  ];
  let timeIndex = 0;
  let id = 0;
  return new AgentThreadRepository({
    threads: new MemoryKv(),
    preferences: new MemoryKv(),
    now: () => new Date(timestamps[timeIndex++] ?? timestamps.at(-1)),
    createId: () => `thread-${++id}`,
  });
}

describe("AgentThreadRepository", () => {
  it("creates independently resumable threads and lists newest first", () => {
    const repo = repository();
    const first = repo.create({ title: "Launch review" });
    const second = repo.create({ title: "Incident analysis" });

    expect(first.eve).toEqual({
      session: { streamIndex: 0 },
      events: [],
      compaction: {
        policyVersion: "sigil-chat-event-retention-v1",
        firstRetainedStreamIndex: 0,
        omittedEventCount: 0,
        compactedAt: "2026-07-16T10:00:00.000Z",
      },
    });
    expect(repo.list().map((thread) => thread.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(repo.getActivePreference().activeThreadId).toBe(second.id);
  });

  it("ensures one default active thread for first-load query paths", () => {
    const repo = repository();

    const threads = repo.ensureActive();

    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      id: "thread-1",
      title: "New conversation",
      status: "active",
    });
    expect(repo.ensureActive()).toHaveLength(1);
  });

  it("persists a bounded redacted event read model with its receipt", () => {
    const repo = repository();
    const thread = repo.create();
    const events = [
      userEvent("What changed?", "turn-1"),
      assistantEvent("Two launch rules changed.", "turn-1"),
    ];

    const saved = repo.saveSnapshot(
      thread.id,
      {
        session: {
          continuationToken: "continue-secret",
          sessionId: "eve-session-1",
          streamIndex: 17,
        },
        events: [
          ...events,
          {
            type: "reasoning.completed",
            data: {
              reasoning: "private reasoning sentinel",
              sequence: 2,
              stepIndex: 0,
              turnId: "turn-1",
            },
          },
        ],
      },
      thread.revision,
    );

    expect(saved.revision).toBe(2);
    expect(saved.eve.session).toEqual({
      continuationToken: "continue-secret",
      sessionId: "eve-session-1",
      streamIndex: 17,
    });
    expect(saved.eve.events.map((event) => event.type)).toEqual([
      "message.received",
      "message.completed",
    ]);
    expect(saved.eve.compaction).toEqual({
      policyVersion: "sigil-chat-event-retention-v1",
      firstRetainedStreamIndex: 0,
      omittedEventCount: 1,
      compactedAt: "2026-07-16T10:01:00.000Z",
    });
    expect(JSON.stringify(saved)).not.toContain("private reasoning sentinel");
  });

  it("projects token-free thread catalog summaries", () => {
    const repo = repository();
    const thread = repo.create({ title: "Private session" });
    const saved = repo.saveSnapshot(
      thread.id,
      {
        session: {
          continuationToken: "catalog-must-not-contain-this",
          sessionId: "eve-session-1",
          streamIndex: 2,
        },
        events: [userEvent("Private transcript", "turn-1")],
      },
      thread.revision,
    );

    const summary = projectAgentThreadSummary(saved);

    expect(summary).toMatchObject({
      id: saved.id,
      title: "Private session",
      revision: saved.revision,
    });
    expect(JSON.stringify(summary)).not.toContain(
      "catalog-must-not-contain-this",
    );
    expect(JSON.stringify(summary)).not.toContain("Private transcript");
  });

  it("rejects stale optimistic writes", () => {
    const repo = repository();
    const thread = repo.create();
    repo.rename(thread.id, "Current title", thread.revision);

    expect(() =>
      repo.rename(thread.id, "Stale title", thread.revision),
    ).toThrow(AgentThreadConflictError);
  });

  it("archives a thread and moves the active preference to another thread", () => {
    const repo = repository();
    const first = repo.create({ title: "First" });
    const second = repo.create({ title: "Second" });

    repo.archive(second.id, second.revision);

    expect(repo.list().map((thread) => thread.id)).toEqual([first.id]);
    expect(repo.list(true)).toHaveLength(2);
    expect(repo.getActivePreference().activeThreadId).toBe(first.id);
  });

  it("hard-deletes the read model and moves the active preference", () => {
    const repo = repository();
    const first = repo.create({ title: "First" });
    const second = repo.create({ title: "Second" });

    const deleted = repo.delete(second.id, second.revision);

    expect(deleted.id).toBe(second.id);
    expect(repo.get(second.id)).toBeUndefined();
    expect(repo.list(true).map((thread) => thread.id)).toEqual([first.id]);
    expect(repo.getActivePreference().activeThreadId).toBe(first.id);
  });

  it("rejects a stale hard-delete revision", () => {
    const repo = repository();
    const thread = repo.create();
    const renamed = repo.rename(thread.id, "Current", thread.revision);

    expect(() => repo.delete(thread.id, thread.revision)).toThrow(
      AgentThreadConflictError,
    );
    expect(repo.get(thread.id)?.revision).toBe(renamed.revision);
  });

  it("forks with provenance and a bounded semantic packet, never Eve handles", () => {
    const repo = repository();
    const source = repo.create({ title: "LiveOps launch" });
    const saved = repo.saveSnapshot(
      source.id,
      {
        session: {
          continuationToken: "must-not-copy",
          sessionId: "must-not-copy",
          streamIndex: 8,
        },
        events: [
          userEvent("Compare the rollback paths.", "turn-1"),
          assistantEvent("The safer path preserves reward state.", "turn-1"),
        ],
      },
      source.revision,
    );

    const fork = repo.fork({
      sourceThreadId: source.id,
      expectedRevision: saved.revision,
    });

    expect(fork.forkedFrom).toBe(source.id);
    expect(fork.eve).toEqual({
      session: { streamIndex: 0 },
      events: [],
      compaction: {
        policyVersion: "sigil-chat-event-retention-v1",
        firstRetainedStreamIndex: 0,
        omittedEventCount: 0,
        compactedAt: "2026-07-16T10:02:00.000Z",
      },
    });
    expect(JSON.stringify(fork)).not.toContain("must-not-copy");
    expect(fork.forkSeed).toMatchObject({
      sourceThreadId: source.id,
      sourceRevision: saved.revision,
      messages: [
        { role: "user", text: "Compare the rollback paths." },
        {
          role: "assistant",
          text: "The safer path preserves reward state.",
        },
      ],
    });
  });

  it("does not re-ingest a persisted fork packet when forking a fork", () => {
    const repo = repository();
    const source = repo.create({ title: "Second generation" });
    const persistedForkTurn = [
      "# Forked conversation context",
      "",
      "This is an older hidden packet.",
      "",
      "### User",
      "Original request that must not be duplicated.",
      "",
      "## New branch request",
      "",
      "Compare the revised rollback owner.",
    ].join("\n");
    const saved = repo.saveSnapshot(
      source.id,
      {
        session: { streamIndex: 2 },
        events: [
          userEvent(persistedForkTurn, "turn-1"),
          assistantEvent("The revision names operations.", "turn-1"),
        ],
      },
      source.revision,
    );

    const secondGeneration = repo.fork({
      sourceThreadId: source.id,
      expectedRevision: saved.revision,
    });

    expect(secondGeneration.forkSeed?.messages).toEqual([
      { role: "user", text: "Compare the revised rollback owner." },
      { role: "assistant", text: "The revision names operations." },
    ]);
    expect(JSON.stringify(secondGeneration.forkSeed)).not.toContain(
      "Original request that must not be duplicated",
    );
  });

  it("consumes a fork seed after the app has used it for the first send", () => {
    const repo = repository();
    const source = repo.create();
    const fork = repo.fork({ sourceThreadId: source.id });

    const consumed = repo.consumeForkSeed(fork.id, fork.revision);

    expect(consumed.forkSeed).toBeUndefined();
    expect(consumed.forkedFrom).toBe(source.id);
    expect(consumed.revision).toBe(2);
  });
});

function userEvent(message: string, turnId: string): HandleMessageStreamEvent {
  return {
    type: "message.received",
    data: { message, sequence: 0, turnId },
  };
}

function assistantEvent(
  message: string,
  turnId: string,
): HandleMessageStreamEvent {
  return {
    type: "message.completed",
    data: {
      finishReason: "stop",
      message,
      sequence: 1,
      stepIndex: 0,
      turnId,
    },
  };
}
