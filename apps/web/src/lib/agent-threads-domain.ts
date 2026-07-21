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

/** A validated display route to a focused scope; never an authority grant. */
export interface ScopePerspective {
  focusScopeId: string;
  /** Ordered display path ending immediately before focusScopeId. */
  viaScopeIds: string[];
}

export interface AgentThreadExecutionBinding {
  /** Server-derived authenticated principal; never accepted from browser input. */
  principalId: string;
  /** Server-validated persona id for this execution thread. */
  personaId: string;
  /**
   * Immutable scope record id. Ordinary sessions are workspace-homed; private
   * cross-project personal-agent sessions are homed in the principal's personal
   * scope.
   */
  homeScopeId: string;
  /** The validated display perspective at session creation/fork time. */
  initialPerspective: ScopePerspective;
  /** Ordered, deduped, server-authorized context scope ids. */
  additionalContextScopeIds: string[];
}

export interface AgentThread {
  members: string[];
  id: string;
  personaId: string;
  executionBinding?: AgentThreadExecutionBinding;
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
  /**
   * The principal's active container selection (PRODUCT-CHROME-REWORK-SPEC
   * §3.1) — the global "where am I" every scoped surface reads. Both fields
   * are optional: no selection resolves to the principal's personal project.
   * A workspace selection always implies its containing project (derived via
   * the registry, validated by the server fn — the domain store does not
   * know the registry); a project-only selection means "project scope, no
   * specific workspace."
   */
  activeProjectId?: string;
  activeWorkspaceId?: string;
  /**
   * Replaces the scalar container preference. The server validates and
   * canonicalizes it before write; the scalar fields remain as a temporary
   * compatibility projection for callers not yet migrated to perspectives.
   */
  activePerspective?: ScopePerspective;
  updatedAt: string;
}

export interface AgentThreadSummary {
  id: string;
  personaId: string;
  executionBinding?: AgentThreadExecutionBinding;
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

export interface CreateAgentThreadInput {
  personaId?: string;
  title?: string;
  workspaceId?: string;
  executionBinding?: AgentThreadExecutionBinding;
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

  getDefaultPersonaId(): string {
    return this.defaultPersonaId;
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
    input: CreateAgentThreadInput = {},
  ): AgentThread {
    const timestamp = this.now().toISOString();
    const workspaceId = normalizeWorkspaceId(input.workspaceId);
    const personaId = normalizePersonaId(input.personaId ?? this.defaultPersonaId);
    const executionBinding = input.executionBinding
      ? normalizeExecutionBinding(input.executionBinding, {
          principalId: userId,
          personaId,
        })
      : workspaceId
        ? legacyExecutionBinding(userId, personaId, workspaceId)
        : undefined;
    const thread: AgentThread = {
      members: [userId],
      id: this.createId(),
      personaId,
      ...(executionBinding ? { executionBinding } : {}),
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
      if (thread.executionBinding) {
        throw new Error(
          "Bound agent thread home scope cannot be changed by workspace rebinding.",
        );
      }
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

  bindExecution(
    userId: string,
    id: string,
    executionBinding: AgentThreadExecutionBinding,
    expectedRevision?: number,
  ): AgentThread {
    return this.update(userId, id, expectedRevision, (thread, timestamp) => {
      const normalized = normalizeExecutionBinding(executionBinding, {
        principalId: userId,
        personaId: thread.personaId,
      });
      if (thread.executionBinding) {
        if (bindingsEqual(thread.executionBinding, normalized)) return thread;
        throw new Error("Agent thread execution binding is immutable.");
      }
      return {
        ...thread,
        executionBinding: normalized,
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
    const executionBinding = source.executionBinding
      ? normalizeExecutionBinding(source.executionBinding, {
          principalId: userId,
          personaId: source.personaId,
        })
      : source.workspaceId
        ? legacyExecutionBinding(userId, source.personaId, source.workspaceId)
        : undefined;
    const fork: AgentThread = {
      members: [...source.members],
      id: this.createId(),
      personaId: source.personaId,
      ...(executionBinding ? { executionBinding } : {}),
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
    if (!preference) {
      return { members: [userId], updatedAt: this.now().toISOString() };
    }
    const normalized = normalizePreferencePerspective(preference);
    if (normalized !== preference) {
      this.preferences.set(activeThreadKey(userId), normalized);
    }
    return structuredClone(normalized);
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
    // Read the raw stored preference — NOT getActivePreference, whose
    // not-found fallback stamps updatedAt with this.now(): a clock-consuming
    // read that would shift timestamps for every subsequent write.
    const existing = this.preferences.get(activeThreadKey(userId));
    const preference: AgentThreadPreference = {
      ...existing,
      members: [userId],
      activeThreadId: id,
      updatedAt,
    };
    this.preferences.set(activeThreadKey(userId), preference);
    return structuredClone(preference);
  }

  /**
   * Persist the principal's active container selection. Membership and
   * containment are validated by the server fn (it has the registries);
   * this layer only enforces shape — a workspace selection clears a stale
   * project field is NOT done here, both are stored verbatim (see the
   * preference interface for the derivation rule).
   */
  setActiveContainer(
    userId: string,
    container: {
      projectId?: string;
      workspaceId?: string;
      perspective?: ScopePerspective;
    },
    updatedAt = this.now().toISOString(),
  ): AgentThreadPreference {
    // Same raw-read rule as setActive (see the comment there).
    const existing = this.preferences.get(activeThreadKey(userId));
    const {
      activePerspective: _activePerspective,
      activeProjectId: _activeProjectId,
      activeWorkspaceId: _activeWorkspaceId,
      ...retained
    } = existing ?? { members: [userId] };
    const perspective =
      normalizeScopePerspective(container.perspective) ??
      legacyContainerPerspective({
        activeProjectId: container.projectId,
        activeWorkspaceId: container.workspaceId,
      });
    const preference: AgentThreadPreference = {
      ...retained,
      members: [userId],
      ...(container.projectId ? { activeProjectId: container.projectId } : {}),
      ...(container.workspaceId
        ? { activeWorkspaceId: container.workspaceId }
        : {}),
      ...(perspective ? { activePerspective: perspective } : {}),
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
    ...(thread.executionBinding
      ? { executionBinding: cloneExecutionBinding(thread.executionBinding) }
      : {}),
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

function normalizeExecutionBinding(
  binding: AgentThreadExecutionBinding,
  expected: { principalId: string; personaId: string },
): AgentThreadExecutionBinding {
  const principalId = normalizePrincipalId(binding.principalId);
  const personaId = normalizePersonaId(binding.personaId);
  if (principalId !== expected.principalId) {
    throw new Error("Agent thread principal binding does not match owner.");
  }
  if (personaId !== expected.personaId) {
    throw new Error("Agent thread persona binding does not match persona.");
  }
  const homeScopeId = normalizeScopeId(binding.homeScopeId, "home scope id");
  return {
    principalId,
    personaId,
    homeScopeId,
    initialPerspective:
      normalizeScopePerspective(binding.initialPerspective) ??
      failInvalidPerspective(),
    additionalContextScopeIds: dedupeScopeIds(binding.additionalContextScopeIds),
  };
}

function legacyExecutionBinding(
  principalId: string,
  personaId: string,
  workspaceId: string | undefined,
): AgentThreadExecutionBinding {
  if (!workspaceId) {
    throw new Error("Agent thread home workspace could not be derived.");
  }
  return {
    principalId,
    personaId,
    homeScopeId: workspaceId,
    initialPerspective: { focusScopeId: workspaceId, viaScopeIds: [] },
    additionalContextScopeIds: [],
  };
}

function bindingsEqual(
  left: AgentThreadExecutionBinding,
  right: AgentThreadExecutionBinding,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizePrincipalId(principalId: string): string {
  const normalized = principalId.trim();
  if (!normalized) {
    throw new Error("Agent thread principal id must be non-empty.");
  }
  return normalized;
}

function normalizeScopeId(scopeId: string, label: string): string {
  const normalized = scopeId.trim();
  if (!normalized) throw new Error(`Agent thread ${label} must be non-empty.`);
  return normalized;
}

function dedupeScopeIds(scopeIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const scopeId of scopeIds) {
    const normalized = normalizeScopeId(scopeId, "context scope id");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function failInvalidPerspective(): never {
  throw new Error("Agent thread initial perspective is invalid.");
}

export function isScopePerspective(value: unknown): value is ScopePerspective {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as ScopePerspective).focusScopeId === "string" &&
    (value as ScopePerspective).focusScopeId.trim().length > 0 &&
    Array.isArray((value as ScopePerspective).viaScopeIds) &&
    (value as ScopePerspective).viaScopeIds.every(
      (scopeId) => typeof scopeId === "string" && scopeId.trim().length > 0,
    ) &&
    new Set((value as ScopePerspective).viaScopeIds).size ===
      (value as ScopePerspective).viaScopeIds.length
  );
}

function normalizeScopePerspective(
  perspective: ScopePerspective | undefined,
): ScopePerspective | undefined {
  if (!isScopePerspective(perspective)) return undefined;
  return {
    focusScopeId: perspective.focusScopeId.trim(),
    viaScopeIds: perspective.viaScopeIds.map((scopeId) => scopeId.trim()),
  };
}

function normalizePreferencePerspective(
  preference: AgentThreadPreference,
): AgentThreadPreference {
  const perspective = normalizeScopePerspective(preference.activePerspective);
  if (perspective) {
    const unchanged =
      preference.activePerspective?.focusScopeId === perspective.focusScopeId &&
      preference.activePerspective.viaScopeIds.every(
        (scopeId, index) => scopeId === perspective.viaScopeIds[index],
      );
    return unchanged ? preference : { ...preference, activePerspective: perspective };
  }
  const legacy = legacyContainerPerspective(preference);
  if (!legacy) {
    return preference.activePerspective === undefined
      ? preference
      : withoutActivePerspective(preference);
  }
  return { ...preference, activePerspective: legacy };
}

function legacyContainerPerspective(
  container: Pick<AgentThreadPreference, "activeProjectId" | "activeWorkspaceId">,
): ScopePerspective | undefined {
  if (container.activeWorkspaceId) {
    return {
      focusScopeId: container.activeWorkspaceId,
      viaScopeIds: container.activeProjectId ? [container.activeProjectId] : [],
    };
  }
  return container.activeProjectId
    ? { focusScopeId: container.activeProjectId, viaScopeIds: [] }
    : undefined;
}

function withoutActivePerspective(
  preference: AgentThreadPreference,
): AgentThreadPreference {
  const { activePerspective: _activePerspective, ...rest } = preference;
  return rest;
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

function cloneExecutionBinding(
  binding: AgentThreadExecutionBinding,
): AgentThreadExecutionBinding {
  return structuredClone(binding);
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
