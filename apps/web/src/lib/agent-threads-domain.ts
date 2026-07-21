import type { HandleMessageStreamEvent, SessionState } from "eve/client";

import {
  sanitizeAndBoundAgentEvents,
  type AgentEventCompactionReceipt,
  type PersistedAgentEvent,
} from "./agent-event-retention";

export type AgentThreadStatus = "active" | "archived";

export interface AgentThreadForkMessage {
  role: "user" | "assistant";
  text: string;
}

export interface AgentThreadForkSeed {
  sourceThreadId: string;
  sourceRevision: number;
  createdAt: string;
  messages: AgentThreadForkMessage[];
}

export interface AgentThread {
  members: string[];
  id: string;
  personaId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: AgentThreadStatus;
  revision: number;
  eve: {
    session: SessionState;
    events: PersistedAgentEvent[];
    compaction: AgentEventCompactionReceipt;
  };
  forkedFrom?: string;
  forkSeed?: AgentThreadForkSeed;
  /**
   * The workspace this thread is bound to. Optional and additive — an
   * unbound thread (no workspaceId) is not an error state, it resolves to
   * the user's personal project (see agent-thread-containers.ts). The
   * containing project is never duplicated here: it is always derived
   * through workspace containment, one registry lookup away.
   */
  workspaceId?: string;
}

export interface AgentThreadPreference {
  members: string[];
  activeThreadId?: string;
  updatedAt: string;
}

export interface AgentThreadSummary {
  id: string;
  personaId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: AgentThreadStatus;
  revision: number;
  forkedFrom?: string;
  workspaceId?: string;
}

export interface AgentThreadKvStore<T> {
  delete(key: string): void;
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  entries(prefix?: string): Array<{ key: string; value: T }>;
}

export interface AgentThreadRepositoryOptions {
  threads: AgentThreadKvStore<AgentThread>;
  preferences: AgentThreadKvStore<AgentThreadPreference>;
  defaultPersonaId: string;
  now?: () => Date;
  createId?: () => string;
}

export interface AgentThreadSnapshot {
  session: SessionState;
  events: HandleMessageStreamEvent[];
}

export interface ForkAgentThreadInput {
  sourceThreadId: string;
  title?: string;
  expectedRevision?: number;
}

const THREAD_KEY_PREFIX = "thread:";
const ACTIVE_THREAD_KEY_PREFIX = "active-thread:";
const DEFAULT_THREAD_TITLE = "New conversation";
const MAX_FORK_MESSAGES = 12;
const MAX_FORK_MESSAGE_CHARS = 2_000;
const MAX_FORK_TOTAL_CHARS = 12_000;
const FORK_PACKET_HEADING = "# Forked conversation context";
const NEW_BRANCH_MARKER = "\n\n## New branch request\n\n";

export class AgentThreadConflictError extends Error {
  constructor(
    readonly threadId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Agent thread ${threadId} changed from revision ${expectedRevision} to ${actualRevision}.`,
    );
    this.name = "AgentThreadConflictError";
  }
}

export class AgentThreadNotFoundError extends Error {
  constructor(readonly threadId: string) {
    super(`Agent thread ${threadId} was not found.`);
    this.name = "AgentThreadNotFoundError";
  }
}

export class AgentThreadRepository {
  private readonly threads: AgentThreadKvStore<AgentThread>;
  private readonly preferences: AgentThreadKvStore<AgentThreadPreference>;
  private readonly defaultPersonaId: string;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(options: AgentThreadRepositoryOptions) {
    this.threads = options.threads;
    this.preferences = options.preferences;
    this.defaultPersonaId = normalizePersonaId(options.defaultPersonaId);
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  list(userId: string, includeArchived = false): AgentThread[] {
    return this.threads
      .entries(THREAD_KEY_PREFIX)
      .map(({ value }) => this.normalizeThread(value))
      .filter((thread) => isMember(thread.members, userId))
      .filter((thread) => includeArchived || thread.status === "active")
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.id.localeCompare(right.id),
      );
  }

  ensureActive(userId: string): AgentThread[] {
    const active = this.list(userId, false);
    return active.length > 0 ? active : [this.create(userId)];
  }

  get(userId: string, id: string): AgentThread | undefined {
    const stored = this.threads.get(threadKey(id));
    const thread = stored ? this.normalizeThread(stored) : undefined;
    return thread && isMember(thread.members, userId)
      ? cloneThread(thread)
      : undefined;
  }

  create(
    userId: string,
    input: { personaId?: string; title?: string; workspaceId?: string } = {},
  ): AgentThread {
    const timestamp = this.now().toISOString();
    const workspaceId = normalizeWorkspaceId(input.workspaceId);
    const thread: AgentThread = {
      members: [userId],
      id: this.createId(),
      personaId: normalizePersonaId(input.personaId ?? this.defaultPersonaId),
      title: normalizeTitle(input.title),
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "active",
      revision: 1,
      eve: {
        session: freshEveSession(),
        events: [],
        compaction: emptyCompaction(timestamp),
      },
      ...(workspaceId ? { workspaceId } : {}),
    };
    this.write(thread);
    this.setActive(userId, thread.id, timestamp);
    return cloneThread(thread);
  }

  /** Rebinds an existing thread to a different workspace, or unbinds it
   *  (personal project) when `workspaceId` is undefined. Containment is
   *  never encoded here — callers resolve/authorize the workspace id before
   *  calling this. */
  rebindWorkspace(
    userId: string,
    id: string,
    workspaceId: string | undefined,
    expectedRevision?: number,
  ): AgentThread {
    return this.update(userId, id, expectedRevision, (thread, timestamp) => {
      const normalized = normalizeWorkspaceId(workspaceId);
      const rebound = cloneThread(thread);
      if (normalized) rebound.workspaceId = normalized;
      else delete rebound.workspaceId;
      return {
        ...rebound,
        updatedAt: timestamp,
        revision: thread.revision + 1,
      };
    });
  }

  rename(
    userId: string,
    id: string,
    title: string,
    expectedRevision?: number,
  ): AgentThread {
    return this.update(userId, id, expectedRevision, (thread, timestamp) => ({
      ...thread,
      title: normalizeTitle(title),
      updatedAt: timestamp,
      revision: thread.revision + 1,
    }));
  }

  archive(userId: string, id: string, expectedRevision?: number): AgentThread {
    const archived = this.update(
      userId,
      id,
      expectedRevision,
      (thread, timestamp) => ({
        ...thread,
        status: "archived",
        updatedAt: timestamp,
        revision: thread.revision + 1,
      }),
    );
    if (this.getActivePreference(userId).activeThreadId === id) {
      const next = this.list(userId, false).find((thread) => thread.id !== id);
      this.setActive(userId, next?.id);
    }
    return archived;
  }

  delete(userId: string, id: string, expectedRevision?: number): AgentThread {
    const deleted = this.require(userId, id);
    assertRevision(deleted, expectedRevision);
    this.threads.delete(threadKey(id));
    if (this.getActivePreference(userId).activeThreadId === id) {
      this.setActive(userId, this.list(userId, false)[0]?.id);
    }
    return deleted;
  }

  saveSnapshot(
    userId: string,
    id: string,
    snapshot: AgentThreadSnapshot,
    expectedRevision?: number,
  ): AgentThread {
    return this.update(userId, id, expectedRevision, (thread, timestamp) => ({
      ...thread,
      updatedAt: timestamp,
      revision: thread.revision + 1,
      eve: {
        session: cloneSession(snapshot.session),
        ...sanitizeAndBoundAgentEvents(snapshot.events, {
          now: () => new Date(timestamp),
        }),
      },
    }));
  }

  fork(userId: string, input: ForkAgentThreadInput): AgentThread {
    const source = this.require(userId, input.sourceThreadId);
    assertRevision(source, input.expectedRevision);
    const timestamp = this.now().toISOString();
    const fork: AgentThread = {
      members: [...source.members],
      id: this.createId(),
      personaId: source.personaId,
      title: normalizeTitle(input.title ?? `${source.title} — fork`),
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "active",
      revision: 1,
      eve: {
        session: freshEveSession(),
        events: [],
        compaction: emptyCompaction(timestamp),
      },
      forkedFrom: source.id,
      forkSeed: buildForkSeed(source, timestamp),
    };
    this.write(fork);
    this.setActive(userId, fork.id, timestamp);
    return cloneThread(fork);
  }

  consumeForkSeed(
    userId: string,
    id: string,
    expectedRevision?: number,
  ): AgentThread {
    return this.update(userId, id, expectedRevision, (thread, timestamp) => {
      if (!thread.forkSeed) return thread;
      const withoutSeed = cloneThread(thread);
      delete withoutSeed.forkSeed;
      return {
        ...withoutSeed,
        updatedAt: timestamp,
        revision: thread.revision + 1,
      };
    });
  }

  getActivePreference(userId: string): AgentThreadPreference {
    const preference = this.preferences.get(activeThreadKey(userId));
    return preference
      ? structuredClone(preference)
      : { members: [userId], updatedAt: this.now().toISOString() };
  }

  setActive(
    userId: string,
    id?: string,
    updatedAt = this.now().toISOString(),
  ): AgentThreadPreference {
    if (id) {
      const thread = this.require(userId, id);
      if (thread.status === "archived") {
        throw new Error(`Archived agent thread ${id} cannot be active.`);
      }
    }
    const preference: AgentThreadPreference = {
      members: [userId],
      activeThreadId: id,
      updatedAt,
    };
    this.preferences.set(activeThreadKey(userId), preference);
    return structuredClone(preference);
  }

  private update(
    userId: string,
    id: string,
    expectedRevision: number | undefined,
    updater: (thread: AgentThread, timestamp: string) => AgentThread,
  ): AgentThread {
    const current = this.require(userId, id);
    assertRevision(current, expectedRevision);
    const updated = updater(current, this.now().toISOString());
    if (updated !== current) this.write(updated);
    return cloneThread(updated);
  }

  private require(userId: string, id: string): AgentThread {
    const stored = this.threads.get(threadKey(id));
    const thread = stored ? this.normalizeThread(stored) : undefined;
    if (!thread || !isMember(thread.members, userId))
      throw new AgentThreadNotFoundError(id);
    return cloneThread(thread);
  }

  private write(thread: AgentThread) {
    this.threads.set(threadKey(thread.id), cloneThread(thread));
  }

  private normalizeThread(thread: AgentThread): AgentThread {
    const hasPersonaId =
      typeof thread.personaId === "string" && thread.personaId.trim()
    const normalized = cloneThread({
      ...thread,
      personaId: hasPersonaId ? thread.personaId.trim() : this.defaultPersonaId,
    });
    if (!hasPersonaId) this.threads.set(threadKey(thread.id), normalized);
    return normalized;
  }

  claimLegacyRecords(userIds: readonly string[]): LegacyClaimResult {
    if (userIds.length !== 1) {
      throw new LegacyAgentThreadClaimRefusedError(userIds.length);
    }

    const [userId] = userIds;
    let claimedThreads = 0;
    let claimedPreferences = 0;
    for (const { key, value } of this.threads.entries(THREAD_KEY_PREFIX)) {
      if (hasMembers(value)) continue;
      this.threads.set(key, { ...value, members: [userId] });
      claimedThreads += 1;
    }
    for (const { key, value } of this.preferences.entries()) {
      if (hasMembers(value)) continue;
      const ownerKey = activeThreadKey(userId);
      if (!this.preferences.get(ownerKey)) {
        this.preferences.set(ownerKey, { ...value, members: [userId] });
      }
      this.preferences.delete(key);
      claimedPreferences += 1;
    }
    return { claimedPreferences, claimedThreads, userId };
  }
}

export interface LegacyClaimResult {
  claimedPreferences: number;
  claimedThreads: number;
  userId: string;
}

export class LegacyAgentThreadClaimRefusedError extends Error {
  constructor(readonly userCount: number) {
    super(
      `Legacy agent-thread records can only be claimed when exactly one user exists; found ${userCount}.`,
    );
    this.name = "LegacyAgentThreadClaimRefusedError";
  }
}

export function projectAgentThreadSummary(
  thread: AgentThread,
): AgentThreadSummary {
  return {
    id: thread.id,
    personaId: thread.personaId,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    status: thread.status,
    revision: thread.revision,
    ...(thread.forkedFrom ? { forkedFrom: thread.forkedFrom } : {}),
    ...(thread.workspaceId ? { workspaceId: thread.workspaceId } : {}),
  };
}

export function buildForkSeed(
  source: AgentThread,
  createdAt: string,
): AgentThreadForkSeed {
  const messages: AgentThreadForkMessage[] = [];
  for (const event of source.eve.events) {
    const message = forkMessageFromEvent(event);
    if (!message) continue;
    messages.push(message);
  }

  const bounded: AgentThreadForkMessage[] = [];
  let totalChars = 0;
  for (const message of messages.slice(-MAX_FORK_MESSAGES).reverse()) {
    const text = message.text.slice(0, MAX_FORK_MESSAGE_CHARS);
    if (totalChars + text.length > MAX_FORK_TOTAL_CHARS) continue;
    bounded.unshift({ ...message, text });
    totalChars += text.length;
  }

  return {
    sourceThreadId: source.id,
    sourceRevision: source.revision,
    createdAt,
    messages: bounded,
  };
}

function forkMessageFromEvent(
  event: PersistedAgentEvent,
): AgentThreadForkMessage | undefined {
  if (event.type === "message.received") {
    return trimmedForkMessage(
      "user",
      userMessageWithoutForkPacket(event.data.message),
    );
  }
  if (event.type === "message.completed" && event.data.message) {
    return trimmedForkMessage("assistant", event.data.message);
  }
  return undefined;
}

function userMessageWithoutForkPacket(message: string): string {
  if (!message.startsWith(FORK_PACKET_HEADING)) return message;
  const markerIndex = message.lastIndexOf(NEW_BRANCH_MARKER);
  return markerIndex < 0
    ? ""
    : message.slice(markerIndex + NEW_BRANCH_MARKER.length);
}

function trimmedForkMessage(
  role: AgentThreadForkMessage["role"],
  text: string,
): AgentThreadForkMessage | undefined {
  const normalized = text.trim();
  return normalized ? { role, text: normalized } : undefined;
}

function normalizeTitle(title?: string): string {
  const normalized = title?.trim();
  return normalized || DEFAULT_THREAD_TITLE;
}

function normalizePersonaId(personaId: string): string {
  const normalized = personaId.trim();
  if (!normalized)
    throw new Error("Agent thread persona id must be non-empty.");
  return normalized;
}

function normalizeWorkspaceId(workspaceId: string | undefined): string | undefined {
  const normalized = workspaceId?.trim();
  return normalized ? normalized : undefined;
}

function threadKey(id: string): string {
  return `${THREAD_KEY_PREFIX}${id}`;
}

function activeThreadKey(userId: string): string {
  return `${ACTIVE_THREAD_KEY_PREFIX}${userId}`;
}

function hasMembers(
  record: Pick<AgentThread, "members"> | Pick<AgentThreadPreference, "members">,
): boolean {
  return Array.isArray(record.members);
}

function isMember(members: unknown, userId: string): boolean {
  return Array.isArray(members) && members.includes(userId);
}

function freshEveSession(): SessionState {
  return { streamIndex: 0 };
}

function emptyCompaction(timestamp: string): AgentEventCompactionReceipt {
  return sanitizeAndBoundAgentEvents([], {
    now: () => new Date(timestamp),
  }).compaction;
}

function cloneSession(session: SessionState): SessionState {
  return {
    ...(session.continuationToken
      ? { continuationToken: session.continuationToken }
      : {}),
    ...(session.sessionId ? { sessionId: session.sessionId } : {}),
    streamIndex: session.streamIndex,
  };
}

function cloneThread(thread: AgentThread): AgentThread {
  return structuredClone(thread);
}

function assertRevision(thread: AgentThread, expectedRevision?: number): void {
  if (expectedRevision !== undefined && expectedRevision !== thread.revision) {
    throw new AgentThreadConflictError(
      thread.id,
      expectedRevision,
      thread.revision,
    );
  }
}
