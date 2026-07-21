import { describe, expect, it } from "vitest";
import type { HandleMessageStreamEvent } from "eve/client";

import {
  AgentThreadConflictError,
  AgentThreadNotFoundError,
  AgentThreadRepository,
  LegacyAgentThreadClaimRefusedError,
  projectAgentThreadSummary,
  type AgentThread,
  type AgentThreadPreference,
  type AgentThreadKvStore,
} from "./agent-threads-domain";

const USER_A = "user-a";
const USER_B = "user-b";

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
    defaultPersonaId: "agent-a",
    threads: new MemoryKv(),
    preferences: new MemoryKv(),
    now: () => new Date(timestamps[timeIndex++] ?? timestamps.at(-1)),
    createId: () => `thread-${++id}`,
  });
}

describe("AgentThreadRepository", () => {
  it("creates independently resumable threads and lists newest first", () => {
    const repo = repository();
    const first = repo.create(USER_A, { title: "Launch review" });
    const second = repo.create(USER_A, {
      personaId: "agent-b",
      title: "Incident analysis",
    });

    expect(first.eve).toEqual({
      session: { streamIndex: 0 },
      events: [],
      compaction: {
        policyVersion: "sigil-chat-event-retention-v2",
        firstRetainedStreamIndex: 0,
        omittedEventCount: 0,
        compactedAt: "2026-07-16T10:00:00.000Z",
      },
    });
    expect(repo.list(USER_A).map((thread) => thread.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(repo.getActivePreference(USER_A).activeThreadId).toBe(second.id);
    expect(first.personaId).toBe("agent-a");
    expect(second.personaId).toBe("agent-b");
  });

  it("persists the active container selection per principal (§3.1)", () => {
    const repo = repository();

    // Default: no selection (resolves to the personal project upstream).
    expect(repo.getActivePreference(USER_A).activeProjectId).toBeUndefined();
    expect(repo.getActivePreference(USER_A).activeWorkspaceId).toBeUndefined();

    repo.setActiveContainer(USER_A, { projectId: "project-1" });
    expect(repo.getActivePreference(USER_A).activeProjectId).toBe("project-1");
    expect(repo.getActivePreference(USER_A).activeWorkspaceId).toBeUndefined();
    expect(repo.getActivePreference(USER_A).activePerspective).toEqual({
      focusScopeId: "project-1",
      viaScopeIds: [],
    });

    repo.setActiveContainer(USER_A, {
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
    expect(repo.getActivePreference(USER_A).activeWorkspaceId).toBe(
      "workspace-1",
    );
    expect(repo.getActivePreference(USER_A).activePerspective).toEqual({
      focusScopeId: "workspace-1",
      viaScopeIds: ["project-1"],
    });

    // Per-principal isolation: another principal's selection is untouched.
    expect(repo.getActivePreference(USER_B).activeProjectId).toBeUndefined();

    // Clearing returns to the default.
    repo.setActiveContainer(USER_A, {});
    expect(repo.getActivePreference(USER_A).activeProjectId).toBeUndefined();
    expect(repo.getActivePreference(USER_A).activeWorkspaceId).toBeUndefined();
  });

  it("writes back a ScopePerspective for a legacy scalar container preference", () => {
    const preferences = new MemoryKv<AgentThreadPreference>();
    preferences.set(`active-thread:${USER_A}`, {
      members: [USER_A],
      activeProjectId: "project-1",
      activeWorkspaceId: "workspace-1",
      updatedAt: "2026-07-16T10:00:00.000Z",
    });
    const repo = new AgentThreadRepository({
      defaultPersonaId: "agent-a",
      threads: new MemoryKv(),
      preferences,
      now: () => new Date("2026-07-16T10:00:00.000Z"),
    });

    expect(repo.getActivePreference(USER_A).activePerspective).toEqual({
      focusScopeId: "workspace-1",
      viaScopeIds: ["project-1"],
    });
    expect(
      preferences.get(`active-thread:${USER_A}`)?.activePerspective,
    ).toEqual({
      focusScopeId: "workspace-1",
      viaScopeIds: ["project-1"],
    });
  });

  it("persists a direct workspace perspective without a hidden project projection", () => {
    const preferences = new MemoryKv<AgentThreadPreference>();
    preferences.set(`active-thread:${USER_A}`, {
      members: [USER_A],
      activeProjectId: "project-hidden",
      activeWorkspaceId: "workspace-b",
      activePerspective: { focusScopeId: "workspace-b", viaScopeIds: [] },
      updatedAt: "2026-07-21T00:00:00.000Z",
    });
    const repo = new AgentThreadRepository({
      defaultPersonaId: "agent-a",
      threads: new MemoryKv(),
      preferences,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
    });

    const preference = repo.setActiveContainer(USER_A, {
      workspaceId: "workspace-b",
      perspective: { focusScopeId: "workspace-b", viaScopeIds: [] },
    });

    expect(preference).toMatchObject({
      activeWorkspaceId: "workspace-b",
      activePerspective: { focusScopeId: "workspace-b", viaScopeIds: [] },
    });
    expect(preference.activeProjectId).toBeUndefined();
    expect(
      preferences.get(`active-thread:${USER_A}`)?.activeProjectId,
    ).toBeUndefined();
  });

  it("keeps the container selection when the active thread changes", () => {
    const repo = repository();
    repo.setActiveContainer(USER_A, {
      projectId: "project-1",
      workspaceId: "workspace-1",
    });
    const thread = repo.create(USER_A, { title: "T" });

    repo.setActive(USER_A, thread.id);

    const preference = repo.getActivePreference(USER_A);
    expect(preference.activeThreadId).toBe(thread.id);
    expect(preference.activeWorkspaceId).toBe("workspace-1");
  });

  it("ensures one default active thread for first-load query paths", () => {
    const repo = repository();

    const threads = repo.ensureActive(USER_A);

    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      id: "thread-1",
      title: "New conversation",
      status: "active",
    });
    expect(repo.ensureActive(USER_A)).toHaveLength(1);
  });

  it("projects legacy threads through the configured default persona", () => {
    const threads = new MemoryKv<AgentThread>();
    const preferences = new MemoryKv<AgentThreadPreference>();
    const repo = new AgentThreadRepository({
      defaultPersonaId: "agent-default",
      threads,
      preferences,
      createId: () => "thread-legacy",
      now: () => new Date("2026-07-16T10:00:00.000Z"),
    });
    const created = repo.create(USER_A, { personaId: "agent-old" });
    const legacy = structuredClone(created) as Partial<AgentThread>;
    delete legacy.personaId;
    threads.set(`thread:${created.id}`, legacy as AgentThread);

    expect(repo.get(USER_A, created.id)?.personaId).toBe("agent-default");
    expect(threads.get(`thread:${created.id}`)?.personaId).toBe(
      "agent-default",
    );
  });

  it("creates immutable execution bindings with deduped additional context", () => {
    const repo = repository();
    const thread = repo.create(USER_A, {
      personaId: "agent-a",
      title: "Personal reach",
      executionBinding: {
        principalId: USER_A,
        personaId: "agent-a",
        homeScopeId: "personal-scope:user-a",
        initialPerspective: {
          focusScopeId: "personal-scope:user-a",
          viaScopeIds: [],
        },
        additionalContextScopeIds: ["workspace-1", "workspace-1", "project-1"],
      },
    });

    expect(thread.executionBinding).toEqual({
      principalId: USER_A,
      personaId: "agent-a",
      homeScopeId: "personal-scope:user-a",
      initialPerspective: {
        focusScopeId: "personal-scope:user-a",
        viaScopeIds: [],
      },
      additionalContextScopeIds: ["workspace-1", "project-1"],
    });
    expect(projectAgentThreadSummary(thread).executionBinding).toEqual(
      thread.executionBinding,
    );
  });

  it("persists a bounded retained event read model with its receipt", () => {
    const repo = repository();
    const thread = repo.create(USER_A);
    const events = [
      userEvent("What changed?", "turn-1"),
      assistantEvent("Two launch rules changed.", "turn-1"),
    ];

    const saved = repo.saveSnapshot(
      USER_A,
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
      policyVersion: "sigil-chat-event-retention-v2",
      firstRetainedStreamIndex: 0,
      omittedEventCount: 1,
      compactedAt: "2026-07-16T10:01:00.000Z",
    });
    expect(JSON.stringify(saved)).not.toContain("private reasoning sentinel");
  });

  it("projects token-free thread catalog summaries", () => {
    const repo = repository();
    const thread = repo.create(USER_A, { title: "Private session" });
    const saved = repo.saveSnapshot(
      USER_A,
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

  it("carries a bound thread's workspaceId into its summary, and omits it when unbound", () => {
    const repo = repository();
    const bound = repo.create(USER_A, {
      title: "Bound thread",
      workspaceId: "workspace-1",
    });
    const unbound = repo.create(USER_A, { title: "Unbound thread" });

    // This is the exact projector the client's optimistic cache write
    // (agent-threads.ts: cacheThread) reuses — one source of truth, so a
    // freshly created/rebound thread's summary can't drift from the
    // server's the way two separate projectors once did.
    expect(projectAgentThreadSummary(bound)).toMatchObject({
      workspaceId: "workspace-1",
    });
    expect(projectAgentThreadSummary(unbound)).not.toHaveProperty(
      "workspaceId",
    );
  });

  it("rejects workspace rebinding for immutable execution-bound threads", () => {
    const repo = repository();
    const thread = repo.create(USER_A, { workspaceId: "workspace-1" });

    expect(() =>
      repo.rebindWorkspace(
        USER_A,
        thread.id,
        "workspace-2",
        thread.revision,
      ),
    ).toThrow("Bound agent thread home scope cannot be changed");
  });

  it("keeps legacy unbound workspace rebinding available before binding migration", () => {
    const repo = repository();
    const thread = repo.create(USER_A);

    const rebound = repo.rebindWorkspace(
      USER_A,
      thread.id,
      "workspace-2",
      thread.revision,
    );
    expect(rebound.workspaceId).toBe("workspace-2");
    expect(rebound.executionBinding).toBeUndefined();
  });

  it("rejects stale optimistic writes", () => {
    const repo = repository();
    const thread = repo.create(USER_A);
    repo.rename(USER_A, thread.id, "Current title", thread.revision);

    expect(() =>
      repo.rename(USER_A, thread.id, "Stale title", thread.revision),
    ).toThrow(AgentThreadConflictError);
  });

  it("archives a thread and moves the active preference to another thread", () => {
    const repo = repository();
    const first = repo.create(USER_A, { title: "First" });
    const second = repo.create(USER_A, { title: "Second" });

    repo.archive(USER_A, second.id, second.revision);

    expect(repo.list(USER_A).map((thread) => thread.id)).toEqual([first.id]);
    expect(repo.list(USER_A, true)).toHaveLength(2);
    expect(repo.getActivePreference(USER_A).activeThreadId).toBe(first.id);
  });

  it("hard-deletes the read model and moves the active preference", () => {
    const repo = repository();
    const first = repo.create(USER_A, { title: "First" });
    const second = repo.create(USER_A, { title: "Second" });

    const deleted = repo.delete(USER_A, second.id, second.revision);

    expect(deleted.id).toBe(second.id);
    expect(repo.get(USER_A, second.id)).toBeUndefined();
    expect(repo.list(USER_A, true).map((thread) => thread.id)).toEqual([
      first.id,
    ]);
    expect(repo.getActivePreference(USER_A).activeThreadId).toBe(first.id);
  });

  it("rejects a stale hard-delete revision", () => {
    const repo = repository();
    const thread = repo.create(USER_A);
    const renamed = repo.rename(USER_A, thread.id, "Current", thread.revision);

    expect(() => repo.delete(USER_A, thread.id, thread.revision)).toThrow(
      AgentThreadConflictError,
    );
    expect(repo.get(USER_A, thread.id)?.revision).toBe(renamed.revision);
  });

  it("forks with provenance and a bounded semantic packet, never Eve handles", () => {
    const repo = repository();
    const source = repo.create(USER_A, { title: "Draft review" });
    const saved = repo.saveSnapshot(
      USER_A,
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

    const fork = repo.fork(USER_A, {
      sourceThreadId: source.id,
      expectedRevision: saved.revision,
    });

    expect(fork.forkedFrom).toBe(source.id);
    expect(fork.personaId).toBe(source.personaId);
    expect(fork.executionBinding).toEqual(source.executionBinding);
    expect(fork.eve).toEqual({
      session: { streamIndex: 0 },
      events: [],
      compaction: {
        policyVersion: "sigil-chat-event-retention-v2",
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

  it("forks from the source thread's immutable execution binding", () => {
    const repo = repository();
    const source = repo.create(USER_A, {
      personaId: "agent-a",
      executionBinding: {
        principalId: USER_A,
        personaId: "agent-a",
        homeScopeId: "personal-scope:user-a",
        initialPerspective: {
          focusScopeId: "workspace-1",
          viaScopeIds: ["project-1"],
        },
        additionalContextScopeIds: ["project-1"],
      },
    });

    const fork = repo.fork(USER_A, { sourceThreadId: source.id });

    expect(fork.executionBinding).toEqual(source.executionBinding);
    expect(fork.executionBinding?.principalId).toBe(USER_A);
    expect(fork.executionBinding?.personaId).toBe(source.personaId);
  });

  it("does not re-ingest a persisted fork packet when forking a fork", () => {
    const repo = repository();
    const source = repo.create(USER_A, { title: "Second generation" });
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
      USER_A,
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

    const secondGeneration = repo.fork(USER_A, {
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
    const source = repo.create(USER_A);
    const fork = repo.fork(USER_A, { sourceThreadId: source.id });

    const consumed = repo.consumeForkSeed(USER_A, fork.id, fork.revision);

    expect(consumed.forkSeed).toBeUndefined();
    expect(consumed.forkedFrom).toBe(source.id);
    expect(consumed.revision).toBe(2);
  });

  it("denies every thread operation to a non-member", () => {
    const repo = repository();
    const owner = repo.create(USER_A, { title: "Owner-only" });
    const userB = "user-b";

    expect(repo.list(userB)).toEqual([]);
    expect(repo.get(userB, owner.id)).toBeUndefined();
    expect(() => repo.rename(userB, owner.id, "stolen")).toThrow(
      AgentThreadNotFoundError,
    );
    expect(() => repo.archive(userB, owner.id)).toThrow(
      AgentThreadNotFoundError,
    );
    expect(() => repo.delete(userB, owner.id)).toThrow(
      AgentThreadNotFoundError,
    );
    expect(() =>
      repo.saveSnapshot(userB, owner.id, {
        session: { streamIndex: 1 },
        events: [],
      }),
    ).toThrow(AgentThreadNotFoundError);
    expect(() => repo.fork(userB, { sourceThreadId: owner.id })).toThrow(
      AgentThreadNotFoundError,
    );
    expect(() => repo.consumeForkSeed(userB, owner.id)).toThrow(
      AgentThreadNotFoundError,
    );
    expect(() => repo.setActive(userB, owner.id)).toThrow(
      AgentThreadNotFoundError,
    );
  });

  it("claims legacy records only for exactly one user and is idempotent", () => {
    const threads = new MemoryKv<AgentThread>();
    const preferences = new MemoryKv<AgentThreadPreference>();
    threads.set("thread:legacy", {
      id: "legacy",
      title: "Legacy thread",
      createdAt: "2026-07-16T10:00:00.000Z",
      updatedAt: "2026-07-16T10:00:00.000Z",
      status: "active",
      revision: 1,
      eve: { session: { streamIndex: 0 }, events: [], compaction: {} },
    } as unknown as AgentThread);
    preferences.set("active-thread", {
      activeThreadId: "legacy",
      updatedAt: "2026-07-16T10:00:00.000Z",
    } as unknown as AgentThreadPreference);
    const repo = new AgentThreadRepository({
      defaultPersonaId: "agent-a",
      threads,
      preferences,
    });

    expect(() => repo.claimLegacyRecords([USER_A, "user-b"])).toThrow(
      LegacyAgentThreadClaimRefusedError,
    );
    expect(repo.get(USER_A, "legacy")).toBeUndefined();

    expect(repo.claimLegacyRecords([USER_A])).toMatchObject({
      claimedPreferences: 1,
      claimedThreads: 1,
      userId: USER_A,
    });
    expect(repo.get(USER_A, "legacy")?.members).toEqual([USER_A]);
    expect(repo.getActivePreference(USER_A).activeThreadId).toBe("legacy");
    expect(repo.claimLegacyRecords([USER_A])).toMatchObject({
      claimedPreferences: 0,
      claimedThreads: 0,
    });
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
