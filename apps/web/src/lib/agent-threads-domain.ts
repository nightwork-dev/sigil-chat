import {
  sanitizeAndBoundAgentEvents,
  type AgentEventCompactionReceipt,
  type AgentSessionTimelineEvent,
  type PersistedAgentEvent,
} from "./agent-event-retention"
import type { AgentContextReceiptProjectionRecord } from "@workspace/agent-tools/context-receipts"
import {
  cloneBoundAgentModel,
  isBoundAgentModel,
  type BoundAgentModel,
} from "@workspace/agent-contracts/model-binding"

export type AgentThreadStatus = "active" | "archived"

export interface AgentRuntimeSessionState {
  continuationToken?: string
  sessionId?: string
  streamIndex: number
}

export interface AgentThreadForkMessage {
  role: "user" | "assistant"
  text: string
}

export interface AgentThreadForkSeed {
  sourceThreadId: string
  sourceRevision: number
  createdAt: string
  messages: AgentThreadForkMessage[]
}

/** A validated display route to a focused scope; never an authority grant. */
export interface ScopePerspective {
  focusScopeId: string
  /** Ordered display path ending immediately before focusScopeId. */
  viaScopeIds: string[]
}

export interface AgentThreadExecutionBinding {
  /** Server-derived authenticated principal; never accepted from browser input. */
  principalId: string
  /** Server-validated persona id for this execution thread. */
  personaId: string
  /**
   * Immutable scope record id. Ordinary sessions are workspace-homed; private
   * cross-project personal-agent sessions are homed in the principal's personal
   * scope.
   */
  homeScopeId: string
  /** The validated display perspective at session creation/fork time. */
  initialPerspective: ScopePerspective
  /** Ordered, deduped, server-authorized context scope ids. */
  additionalContextScopeIds: string[]
  /**
   * Model this session runs. Absent means the deployment default, which is
   * what every thread created before per-session selection existed carries —
   * so an absent model is a normal state, not a migration gap.
   *
   * The one MUTABLE field on this binding (MDL.5), changed only through
   * `setExecutionModel`. `bindExecution` still refuses to rewrite the binding
   * as a whole, so principal, persona, home scope, and perspective remain
   * immutable — those are what authorize the session. The model is what it
   * runs, and David's 2026-08-01 direction is that a conversation may change
   * it. Eve resolves the model at `step.started` from a proof re-minted every
   * turn, so a change lands on the next turn without a fork or a runtime
   * session rotation.
   */
  model?: BoundAgentModel
}

/**
 * Mutable per-turn request parameters (MDL.4): reasoning level and fast
 * mode.
 *
 * Lives as a sibling of `executionBinding`, never inside it — the binding is
 * immutable session identity once set (`bindExecution` refuses a second
 * write), while this is meant to change freely mid-conversation. See
 * `setRequestOptions` below and `agent-session-binding.ts`, which re-mints
 * the signed proof from this live field on every turn.
 */
export interface AgentThreadRequestOptions {
  reasoningLevel?: string
  fastMode?: boolean
}

export interface AgentThread {
  members: string[]
  id: string
  /**
   * Short, immutable, URL-friendly alias for `id` — 8-char lowercase base36,
   * minted once at creation (or lazily backfilled the first time a
   * pre-slug record is read) and never regenerated. NOT derived from the
   * title: titles mutate, links must not. This is a display/routing alias
   * only — every domain lookup, scope, and persistence key in this file
   * still keys on `id`.
   */
  slug: string
  personaId: string
  executionBinding?: AgentThreadExecutionBinding
  /** See {@link AgentThreadRequestOptions}. Absent is the ordinary state. */
  requestOptions?: AgentThreadRequestOptions
  title: string
  createdAt: string
  updatedAt: string
  status: AgentThreadStatus
  revision: number
  runtime: {
    schemaVersion: 1
    session: AgentRuntimeSessionState
    events: PersistedAgentEvent[]
    compaction: AgentEventCompactionReceipt
  }
  contextReceipts?: AgentContextReceiptProjectionRecord[]
  forkedFrom?: string
  forkSeed?: AgentThreadForkSeed
  /**
   * The workspace this thread is bound to. Optional and additive — an
   * unbound thread (no workspaceId) is not an error state, it resolves to
   * the user's personal project (see agent-thread-containers.ts). The
   * containing project is never duplicated here: it is always derived
   * through workspace containment, one registry lookup away.
   */
  workspaceId?: string
}

export interface AgentThreadPreference {
  members: string[]
  activeThreadId?: string
  /** The principal's canonical active container path. */
  activePerspective?: ScopePerspective
  updatedAt: string
}

export interface AgentThreadSummary {
  id: string
  slug: string
  personaId: string
  executionBinding?: AgentThreadExecutionBinding
  requestOptions?: AgentThreadRequestOptions
  title: string
  createdAt: string
  updatedAt: string
  status: AgentThreadStatus
  revision: number
  forkedFrom?: string
  workspaceId?: string
}

export interface AgentThreadKvStore<T> {
  delete(key: string): void
  get(key: string): T | undefined
  set(key: string, value: T): void
  entries(prefix?: string): Array<{ key: string; value: T }>
}

export interface AgentThreadRepositoryOptions {
  threads: AgentThreadKvStore<AgentThread>
  preferences: AgentThreadKvStore<AgentThreadPreference>
  defaultPersonaId: string
  now?: () => Date
  createId?: () => string
  /** Injectable for tests (mint-on-create, collision regeneration). Defaults
   *  to a random 8-char lowercase base36 string. */
  createSlug?: () => string
}

export interface AgentThreadSnapshot {
  session: AgentRuntimeSessionState
  events: AgentSessionTimelineEvent[]
}

export interface ForkAgentThreadInput {
  sourceThreadId: string
  title?: string
  expectedRevision?: number
}

export interface CreateAgentThreadInput {
  personaId?: string
  title?: string
  workspaceId?: string
  executionBinding?: AgentThreadExecutionBinding
}

const THREAD_KEY_PREFIX = "thread:"
const ACTIVE_THREAD_KEY_PREFIX = "active-thread:"
const DEFAULT_THREAD_TITLE = "New conversation"
const MAX_FORK_MESSAGES = 12
const MAX_FORK_MESSAGE_CHARS = 2_000
const MAX_FORK_TOTAL_CHARS = 12_000
const FORK_PACKET_HEADING = "# Forked conversation context"
const NEW_BRANCH_MARKER = "\n\n## New branch request\n\n"

const SLUG_LENGTH = 8
const SLUG_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
const MAX_SLUG_MINT_ATTEMPTS = 10
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function randomSlug(): string {
  let slug = ""
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    slug += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]
  }
  return slug
}

// Authz finding 2 (2026-07-23, Annika): the lazy slug backfill in
// normalizeThread() below reads-then-writes outside any lock. Web and Eve
// share SIGIL_DATA_DIR, so two processes racing to backfill the SAME
// slug-less thread on their first read would previously each mint a
// DIFFERENT random slug via randomSlug() and both `set()` it —
// last-write-wins, silently breaking the "minted once, never regenerated"
// immutability contract for whichever slug lost the race.
// The fix is deterministic convergence, not a lock: this repository has no
// cross-process lock primitive (unlike project-registry.ts's
// withRegistryRecordLock, which is Eve/Node-fs-only — this file's import
// chain is browser-reachable, so it can't pull in a Node `node:fs` lock
// without becoming a canary violation). A backfill candidate derived from
// the thread's own immutable `id` is IDENTICAL no matter which process
// computes it, so a last-write-wins race between two backfills of the same
// thread is harmless: both writers agree on the value, so it doesn't matter
// which one's write survives. FNV-1a is a plain synchronous string hash —
// no node:crypto, so this stays safe in a client-reachable import chain.
function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function deterministicSlugCandidate(threadId: string, attempt: number): string {
  let seed = fnv1aHash(`${threadId}:${attempt}`)
  let slug = ""
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    slug += SLUG_ALPHABET[seed % SLUG_ALPHABET.length]
    seed = Math.imul(seed ^ (seed >>> 15), 0x2545f491) >>> 0
  }
  return slug
}

/** 36-char UUID (crypto.randomUUID() form) vs an 8-char base36 slug — no
 *  ambiguity between the two shapes, so a route param resolves unambiguously
 *  without a heuristic guess. */
export function isUuidShaped(candidate: string): boolean {
  return UUID_PATTERN.test(candidate)
}

export class AgentThreadConflictError extends Error {
  constructor(
    readonly threadId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Agent thread ${threadId} changed from revision ${expectedRevision} to ${actualRevision}.`,
    )
    this.name = "AgentThreadConflictError"
  }
}

export class AgentThreadNotFoundError extends Error {
  constructor(readonly threadId: string) {
    super(`Agent thread ${threadId} was not found.`)
    this.name = "AgentThreadNotFoundError"
  }
}

export class AgentThreadRepository {
  private readonly threads: AgentThreadKvStore<AgentThread>
  private readonly preferences: AgentThreadKvStore<AgentThreadPreference>
  private readonly defaultPersonaId: string
  private readonly now: () => Date
  private readonly createId: () => string
  private readonly createSlug: () => string

  constructor(options: AgentThreadRepositoryOptions) {
    this.threads = options.threads
    this.preferences = options.preferences
    this.defaultPersonaId = normalizePersonaId(options.defaultPersonaId)
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? (() => crypto.randomUUID())
    this.createSlug = options.createSlug ?? randomSlug
  }

  list(userId: string, includeArchived = false): AgentThread[] {
    return this.threads
      .entries(THREAD_KEY_PREFIX)
      .map(({ value }) => this.normalizeThread(value, userId))
      .filter((thread) => isMember(thread.members, userId))
      .filter((thread) => includeArchived || thread.status === "active")
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.id.localeCompare(right.id),
      )
  }

  ensureActive(userId: string): AgentThread[] {
    const active = this.list(userId, false)
    return active.length > 0 ? active : [this.create(userId)]
  }

  getDefaultPersonaId(): string {
    return this.defaultPersonaId
  }

  get(userId: string, id: string): AgentThread | undefined {
    const stored = this.threads.get(threadKey(id))
    const thread = stored ? this.normalizeThread(stored, userId) : undefined
    return thread && isMember(thread.members, userId)
      ? cloneThread(thread)
      : undefined
  }

  /** Resolves a thread by its immutable slug, scoped to this principal's own
   *  threads (mirrors the mint-time collision scope — see mintUniqueSlug).
   *  Lazily backfills any pre-slug record it scans past, same as list/get. */
  getBySlug(userId: string, slug: string): AgentThread | undefined {
    const normalizedSlug = slug.trim().toLowerCase()
    if (!normalizedSlug) return undefined
    for (const { value } of this.threads.entries(THREAD_KEY_PREFIX)) {
      if (!isMember(value.members, userId)) continue
      const thread = this.normalizeThread(value, userId)
      if (thread.slug === normalizedSlug) return cloneThread(thread)
    }
    return undefined
  }

  /** The route-boundary resolver (SC.10 session slugs): a URL segment is
   *  either a slug (the canonical, common case) or a legacy UUID (an old
   *  link). Tries the exact id lookup first (a real id and a slug never
   *  collide — ids are KV keys, slugs never are), then falls back to slug
   *  resolution. Callers redirect to `.slug` when it differs from what was
   *  requested — that comparison is what actually distinguishes "was a
   *  UUID" from "was already canonical", not isUuidShaped (kept, and
   *  exported, purely as a documented/tested shape fact — id and slug
   *  formats truly never overlap; it isn't load-bearing for dispatch here,
   *  precisely so synthetic non-UUID ids in tests keep resolving by id). */
  resolveByRouteParam(
    userId: string,
    candidate: string,
  ): AgentThread | undefined {
    const trimmed = candidate.trim()
    return this.get(userId, trimmed) ?? this.getBySlug(userId, trimmed)
  }

  private mintUniqueSlug(userId: string): string {
    const existing = new Set(
      this.threads
        .entries(THREAD_KEY_PREFIX)
        .filter(({ value }) => isMember(value.members, userId))
        .map(({ value }) => value.slug)
        .filter((slug): slug is string => Boolean(slug)),
    )
    for (let attempt = 0; attempt < MAX_SLUG_MINT_ATTEMPTS; attempt += 1) {
      const candidate = this.createSlug()
      if (!existing.has(candidate)) return candidate
    }
    throw new Error(
      `Could not mint a unique session slug for principal ${userId} after ${MAX_SLUG_MINT_ATTEMPTS} attempts.`,
    )
  }

  /** The lazy-backfill mint (finding 2 above) — deterministic from the
   *  thread's own id, unlike mintUniqueSlug's random mint used by
   *  create()/fork(), which never races (each writes a freshly-generated
   *  id nothing else could be reading yet). */
  private mintDeterministicBackfillSlug(
    userId: string,
    threadId: string,
  ): string {
    const existing = new Set(
      this.threads
        .entries(THREAD_KEY_PREFIX)
        .filter(
          ({ key, value }) =>
            key !== threadKey(threadId) && isMember(value.members, userId),
        )
        .map(({ value }) => value.slug)
        .filter((slug): slug is string => Boolean(slug)),
    )
    // Residual (documented, not fixed, per Annika's re-review): `existing`
    // is read without a lock, so two processes racing to backfill DIFFERENT
    // threads whose deterministic candidates happen to collide could still
    // each observe the other's slug as free and both mint it — astronomically
    // unlikely (would need two real thread ids to collide on the same FNV-1a
    // digest at the same attempt index within the SAME race window), and
    // strictly no worse than create()/fork()'s pre-existing random-mint
    // collision window, which this repository has always accepted.
    for (let attempt = 0; attempt < MAX_SLUG_MINT_ATTEMPTS; attempt += 1) {
      const candidate = deterministicSlugCandidate(threadId, attempt)
      if (!existing.has(candidate)) return candidate
    }
    throw new Error(
      `Could not mint a deterministic backfill slug for thread ${threadId} after ${MAX_SLUG_MINT_ATTEMPTS} attempts.`,
    )
  }

  create(userId: string, input: CreateAgentThreadInput = {}): AgentThread {
    const timestamp = this.now().toISOString()
    const workspaceId = normalizeWorkspaceId(input.workspaceId)
    const personaId = normalizePersonaId(
      input.personaId ?? this.defaultPersonaId,
    )
    const executionBinding = input.executionBinding
      ? normalizeExecutionBinding(input.executionBinding, {
          principalId: userId,
          personaId,
        })
      : workspaceId
        ? legacyExecutionBinding(userId, personaId, workspaceId)
        : undefined
    const thread: AgentThread = {
      members: [userId],
      id: this.createId(),
      slug: this.mintUniqueSlug(userId),
      personaId,
      ...(executionBinding ? { executionBinding } : {}),
      title: normalizeTitle(input.title),
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "active",
      revision: 1,
      runtime: {
        schemaVersion: 1,
        session: freshRuntimeSession(),
        events: [],
        compaction: emptyCompaction(timestamp),
      },
      ...(workspaceId ? { workspaceId } : {}),
    }
    this.write(thread)
    this.setActive(userId, thread.id, timestamp)
    return cloneThread(thread)
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
        )
      }
      const normalized = normalizeWorkspaceId(workspaceId)
      const rebound = cloneThread(thread)
      if (normalized) rebound.workspaceId = normalized
      else delete rebound.workspaceId
      return {
        ...rebound,
        updatedAt: timestamp,
        revision: thread.revision + 1,
      }
    })
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
      })
      if (thread.executionBinding) {
        if (bindingsEqual(thread.executionBinding, normalized)) return thread
        throw new Error("Agent thread execution binding is immutable.")
      }
      return {
        ...thread,
        executionBinding: normalized,
        updatedAt: timestamp,
        revision: thread.revision + 1,
      }
    })
  }

  /**
   * Replaces the bound model of an ALREADY-bound thread (MDL.5).
   *
   * Deliberately not a second `bindExecution`: it reads the existing binding
   * and swaps one field, so there is no shape in which a caller can supply a
   * principal, persona, or scope here at all. `bindExecution` keeps refusing
   * a whole-binding rewrite, which is the guard that matters — this narrows
   * it to the model rather than removing it.
   *
   * An unbound thread is refused rather than bound implicitly: binding is
   * `bindExecution`'s job (it authorizes scopes), and inventing a binding
   * from a model choice would skip that.
   *
   * `undefined` clears the selection, returning the thread to the deployment
   * default — the same state a thread created without a model is in, not a
   * distinct third state.
   */
  setExecutionModel(
    userId: string,
    id: string,
    model: BoundAgentModel | undefined,
    expectedRevision?: number,
  ): AgentThread {
    return this.update(userId, id, expectedRevision, (thread, timestamp) => {
      if (!thread.executionBinding) {
        throw new Error(
          "Agent thread has no execution binding to change the model of.",
        )
      }
      const next = { ...thread.executionBinding }
      if (model === undefined) delete next.model
      else if (isBoundAgentModel(model)) next.model = cloneBoundAgentModel(model)
      else throw new Error("Agent thread model binding is malformed.")
      if (bindingsEqual(thread.executionBinding, next)) return thread
      return {
        ...thread,
        executionBinding: next,
        updatedAt: timestamp,
        revision: thread.revision + 1,
      }
    })
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
    }))
  }

  /**
   * Replaces the thread's mutable reasoning level / fast mode (MDL.4).
   *
   * Unlike `bindExecution`, this never refuses a second write — that is the
   * entire point of keeping it out of `executionBinding`. An empty object
   * clears both fields rather than requiring a separate "unset" call.
   */
  setRequestOptions(
    userId: string,
    id: string,
    requestOptions: AgentThreadRequestOptions,
    expectedRevision?: number,
  ): AgentThread {
    return this.update(userId, id, expectedRevision, (thread, timestamp) => {
      const normalized = normalizeRequestOptions(requestOptions)
      const next = { ...thread }
      if (normalized) next.requestOptions = normalized
      else delete next.requestOptions
      return {
        ...next,
        updatedAt: timestamp,
        revision: thread.revision + 1,
      }
    })
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
    )
    if (this.getActivePreference(userId).activeThreadId === id) {
      const next = this.list(userId, false).find((thread) => thread.id !== id)
      this.setActive(userId, next?.id)
    }
    return archived
  }

  delete(userId: string, id: string, expectedRevision?: number): AgentThread {
    const deleted = this.require(userId, id)
    assertRevision(deleted, expectedRevision)
    this.threads.delete(threadKey(id))
    if (this.getActivePreference(userId).activeThreadId === id) {
      this.setActive(userId, this.list(userId, false)[0]?.id)
    }
    return deleted
  }

  saveSnapshot(
    userId: string,
    id: string,
    snapshot: AgentThreadSnapshot,
    expectedRevision?: number,
  ): AgentThread {
    const current = this.require(userId, id)
    if (
      expectedRevision !== undefined &&
      expectedRevision !== current.revision &&
      snapshotMatchesRuntime(current, snapshot)
    ) {
      return current
    }
    assertRevision(current, expectedRevision)
    const timestamp = this.now().toISOString()
    const updated: AgentThread = {
      ...current,
      updatedAt: timestamp,
      revision: current.revision + 1,
      runtime: {
        schemaVersion: 1,
        session: cloneSession(snapshot.session),
        ...sanitizeAndBoundAgentEvents(snapshot.events, {
          now: () => new Date(timestamp),
        }),
      },
    }
    this.write(updated)
    return cloneThread(updated)
  }

  fork(userId: string, input: ForkAgentThreadInput): AgentThread {
    const source = this.require(userId, input.sourceThreadId)
    assertRevision(source, input.expectedRevision)
    const timestamp = this.now().toISOString()
    const executionBinding = source.executionBinding
      ? normalizeExecutionBinding(source.executionBinding, {
          principalId: userId,
          personaId: source.personaId,
        })
      : source.workspaceId
        ? legacyExecutionBinding(userId, source.personaId, source.workspaceId)
        : undefined
    const fork: AgentThread = {
      members: [...source.members],
      id: this.createId(),
      slug: this.mintUniqueSlug(userId),
      personaId: source.personaId,
      ...(executionBinding ? { executionBinding } : {}),
      title: normalizeTitle(input.title ?? `${source.title} — fork`),
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "active",
      revision: 1,
      runtime: {
        schemaVersion: 1,
        session: freshRuntimeSession(),
        events: [],
        compaction: emptyCompaction(timestamp),
      },
      forkedFrom: source.id,
      forkSeed: buildForkSeed(source, timestamp),
    }
    this.write(fork)
    this.setActive(userId, fork.id, timestamp)
    return cloneThread(fork)
  }

  consumeForkSeed(
    userId: string,
    id: string,
    expectedRevision?: number,
  ): AgentThread {
    return this.update(userId, id, expectedRevision, (thread, timestamp) => {
      if (!thread.forkSeed) return thread
      const withoutSeed = cloneThread(thread)
      delete withoutSeed.forkSeed
      return {
        ...withoutSeed,
        updatedAt: timestamp,
        revision: thread.revision + 1,
      }
    })
  }

  getActivePreference(userId: string): AgentThreadPreference {
    const preference = this.preferences.get(activeThreadKey(userId))
    if (!preference) {
      return { members: [userId], updatedAt: this.now().toISOString() }
    }
    const normalized = normalizePreferencePerspective(preference)
    if (normalized !== preference) {
      this.preferences.set(activeThreadKey(userId), normalized)
    }
    return structuredClone(normalized)
  }

  setActive(
    userId: string,
    id?: string,
    updatedAt = this.now().toISOString(),
  ): AgentThreadPreference {
    if (id) {
      const thread = this.require(userId, id)
      if (thread.status === "archived") {
        throw new Error(`Archived agent thread ${id} cannot be active.`)
      }
    }
    // Read the raw stored preference — NOT getActivePreference, whose
    // not-found fallback stamps updatedAt with this.now(): a clock-consuming
    // read that would shift timestamps for every subsequent write.
    const existing = this.preferences.get(activeThreadKey(userId))
    const preference: AgentThreadPreference = {
      ...existing,
      members: [userId],
      activeThreadId: id,
      updatedAt,
    }
    this.preferences.set(activeThreadKey(userId), preference)
    return structuredClone(preference)
  }

  /**
   * Persist the principal's active container selection. Membership and
   * containment are validated by the server fn (it has the registries). This
   * layer stores only the canonical perspective and drops legacy scalar
   * projections whenever it writes the record.
   */
  setActiveContainer(
    userId: string,
    container: { perspective?: ScopePerspective },
    updatedAt = this.now().toISOString(),
  ): AgentThreadPreference {
    // Same raw-read rule as setActive (see the comment there).
    const existing = this.preferences.get(activeThreadKey(userId))
    const {
      activePerspective: _activePerspective,
      activeProjectId: _activeProjectId,
      activeWorkspaceId: _activeWorkspaceId,
      ...retained
    } = (existing as StoredAgentThreadPreference | undefined) ?? {
      members: [userId],
    }
    const perspective = normalizeScopePerspective(container.perspective)
    const preference: AgentThreadPreference = {
      ...retained,
      members: [userId],
      ...(perspective ? { activePerspective: perspective } : {}),
      updatedAt,
    }
    this.preferences.set(activeThreadKey(userId), preference)
    return structuredClone(preference)
  }

  private update(
    userId: string,
    id: string,
    expectedRevision: number | undefined,
    updater: (thread: AgentThread, timestamp: string) => AgentThread,
  ): AgentThread {
    const current = this.require(userId, id)
    assertRevision(current, expectedRevision)
    const updated = updater(current, this.now().toISOString())
    if (updated !== current) this.write(updated)
    return cloneThread(updated)
  }

  private require(userId: string, id: string): AgentThread {
    const stored = this.threads.get(threadKey(id))
    const thread = stored ? this.normalizeThread(stored, userId) : undefined
    if (!thread || !isMember(thread.members, userId))
      throw new AgentThreadNotFoundError(id)
    return cloneThread(thread)
  }

  private write(thread: AgentThread) {
    this.threads.set(threadKey(thread.id), cloneThread(thread))
  }

  /** Lazy backfill (SC.10 session slugs): any thread read without a slug
   *  (created before this migration) gets one minted and persisted here, the
   *  same idiom already used for personaId/runtime-schema backfill below —
   *  no migration script, the first read heals the record. `userId` scopes
   *  the mint's collision check to this principal's OTHER threads, matching
   *  mintUniqueSlug's own scope. */
  private normalizeThread(thread: AgentThread, userId: string): AgentThread {
    const stored = thread as StoredAgentThread
    const hasPersonaId =
      typeof thread.personaId === "string" && thread.personaId.trim()
    const runtime =
      stored.runtime?.schemaVersion === 1
        ? stored.runtime
        : freshRuntimeRecord(thread.updatedAt)
    const hasSlug = typeof thread.slug === "string" && thread.slug.trim()
    const slug = hasSlug
      ? thread.slug.trim().toLowerCase()
      : this.mintDeterministicBackfillSlug(userId, thread.id)
    const normalized = cloneThread({
      ...stored,
      personaId: hasPersonaId ? thread.personaId.trim() : this.defaultPersonaId,
      runtime,
      slug,
    })
    if (!hasPersonaId || stored.runtime?.schemaVersion !== 1 || !hasSlug) {
      this.threads.set(threadKey(thread.id), normalized)
    }
    return normalized
  }

  claimLegacyRecords(userIds: readonly string[]): LegacyClaimResult {
    if (userIds.length !== 1) {
      throw new LegacyAgentThreadClaimRefusedError(userIds.length)
    }

    const [userId] = userIds
    let claimedThreads = 0
    let claimedPreferences = 0
    for (const { key, value } of this.threads.entries(THREAD_KEY_PREFIX)) {
      if (hasMembers(value)) continue
      this.threads.set(key, { ...value, members: [userId] })
      claimedThreads += 1
    }
    for (const { key, value } of this.preferences.entries()) {
      if (hasMembers(value)) continue
      const ownerKey = activeThreadKey(userId)
      if (!this.preferences.get(ownerKey)) {
        this.preferences.set(ownerKey, { ...value, members: [userId] })
      }
      this.preferences.delete(key)
      claimedPreferences += 1
    }
    return { claimedPreferences, claimedThreads, userId }
  }
}

export interface LegacyClaimResult {
  claimedPreferences: number
  claimedThreads: number
  userId: string
}

export class LegacyAgentThreadClaimRefusedError extends Error {
  constructor(readonly userCount: number) {
    super(
      `Legacy agent-thread records can only be claimed when exactly one user exists; found ${userCount}.`,
    )
    this.name = "LegacyAgentThreadClaimRefusedError"
  }
}

export function projectAgentThreadSummary(
  thread: AgentThread,
): AgentThreadSummary {
  return {
    id: thread.id,
    slug: thread.slug,
    personaId: thread.personaId,
    ...(thread.executionBinding
      ? { executionBinding: cloneExecutionBinding(thread.executionBinding) }
      : {}),
    ...(thread.requestOptions
      ? { requestOptions: { ...thread.requestOptions } }
      : {}),
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    status: thread.status,
    revision: thread.revision,
    ...(thread.forkedFrom ? { forkedFrom: thread.forkedFrom } : {}),
    ...(thread.workspaceId ? { workspaceId: thread.workspaceId } : {}),
  }
}

export function buildForkSeed(
  source: AgentThread,
  createdAt: string,
): AgentThreadForkSeed {
  const messages: AgentThreadForkMessage[] = []
  for (const event of source.runtime.events) {
    const message = forkMessageFromEvent(event)
    if (!message) continue
    messages.push(message)
  }

  const bounded: AgentThreadForkMessage[] = []
  let totalChars = 0
  for (const message of messages.slice(-MAX_FORK_MESSAGES).reverse()) {
    const text = message.text.slice(0, MAX_FORK_MESSAGE_CHARS)
    if (totalChars + text.length > MAX_FORK_TOTAL_CHARS) continue
    bounded.unshift({ ...message, text })
    totalChars += text.length
  }

  return {
    sourceThreadId: source.id,
    sourceRevision: source.revision,
    createdAt,
    messages: bounded,
  }
}

function forkMessageFromEvent(
  event: PersistedAgentEvent,
): AgentThreadForkMessage | undefined {
  if (event.type === "message.received") {
    return trimmedForkMessage(
      "user",
      userMessageWithoutForkPacket(event.data.message),
    )
  }
  if (event.type === "message.completed" && event.data.message) {
    return trimmedForkMessage("assistant", event.data.message)
  }
  return undefined
}

function userMessageWithoutForkPacket(message: string): string {
  if (!message.startsWith(FORK_PACKET_HEADING)) return message
  const markerIndex = message.lastIndexOf(NEW_BRANCH_MARKER)
  return markerIndex < 0
    ? ""
    : message.slice(markerIndex + NEW_BRANCH_MARKER.length)
}

function trimmedForkMessage(
  role: AgentThreadForkMessage["role"],
  text: string,
): AgentThreadForkMessage | undefined {
  const normalized = text.trim()
  return normalized ? { role, text: normalized } : undefined
}

function normalizeTitle(title?: string): string {
  const normalized = title?.trim()
  return normalized || DEFAULT_THREAD_TITLE
}

/** Returns undefined when both fields are absent, so the caller can delete
 *  the thread's `requestOptions` key rather than store an empty object. */
function normalizeRequestOptions(
  input: AgentThreadRequestOptions,
): AgentThreadRequestOptions | undefined {
  const reasoningLevel = input.reasoningLevel?.trim() || undefined
  const fastMode = input.fastMode === true ? true : undefined
  if (reasoningLevel === undefined && fastMode === undefined) return undefined
  return {
    ...(reasoningLevel !== undefined ? { reasoningLevel } : {}),
    ...(fastMode !== undefined ? { fastMode } : {}),
  }
}

function normalizePersonaId(personaId: string): string {
  const normalized = personaId.trim()
  if (!normalized) throw new Error("Agent thread persona id must be non-empty.")
  return normalized
}

function normalizeWorkspaceId(
  workspaceId: string | undefined,
): string | undefined {
  const normalized = workspaceId?.trim()
  return normalized ? normalized : undefined
}

function normalizeExecutionBinding(
  binding: AgentThreadExecutionBinding,
  expected: { principalId: string; personaId: string },
): AgentThreadExecutionBinding {
  const principalId = normalizePrincipalId(binding.principalId)
  const personaId = normalizePersonaId(binding.personaId)
  if (principalId !== expected.principalId) {
    throw new Error("Agent thread principal binding does not match owner.")
  }
  if (personaId !== expected.personaId) {
    throw new Error("Agent thread persona binding does not match persona.")
  }
  const homeScopeId = normalizeScopeId(binding.homeScopeId, "home scope id")
  return {
    principalId,
    personaId,
    homeScopeId,
    initialPerspective:
      normalizeScopePerspective(binding.initialPerspective) ??
      failInvalidPerspective(),
    additionalContextScopeIds: dedupeScopeIds(
      binding.additionalContextScopeIds,
    ),
    // Immutable once written: normalization copies the recorded snapshot and
    // never re-derives it from current config, so a fixture edit cannot
    // retroactively change what an existing session is running.
    ...(isBoundAgentModel(binding.model)
      ? { model: cloneBoundAgentModel(binding.model) }
      : {}),
  }
}

function legacyExecutionBinding(
  principalId: string,
  personaId: string,
  workspaceId: string | undefined,
): AgentThreadExecutionBinding {
  if (!workspaceId) {
    throw new Error("Agent thread home workspace could not be derived.")
  }
  return {
    principalId,
    personaId,
    homeScopeId: workspaceId,
    initialPerspective: { focusScopeId: workspaceId, viaScopeIds: [] },
    additionalContextScopeIds: [],
  }
}

function bindingsEqual(
  left: AgentThreadExecutionBinding,
  right: AgentThreadExecutionBinding,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function normalizePrincipalId(principalId: string): string {
  const normalized = principalId.trim()
  if (!normalized) {
    throw new Error("Agent thread principal id must be non-empty.")
  }
  return normalized
}

function normalizeScopeId(scopeId: string, label: string): string {
  const normalized = scopeId.trim()
  if (!normalized) throw new Error(`Agent thread ${label} must be non-empty.`)
  return normalized
}

function dedupeScopeIds(scopeIds: readonly string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const scopeId of scopeIds) {
    const normalized = normalizeScopeId(scopeId, "context scope id")
    if (seen.has(normalized)) continue
    seen.add(normalized)
    deduped.push(normalized)
  }
  return deduped
}

function failInvalidPerspective(): never {
  throw new Error("Agent thread initial perspective is invalid.")
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
  )
}

function normalizeScopePerspective(
  perspective: ScopePerspective | undefined,
): ScopePerspective | undefined {
  if (!isScopePerspective(perspective)) return undefined
  return {
    focusScopeId: perspective.focusScopeId.trim(),
    viaScopeIds: perspective.viaScopeIds.map((scopeId) => scopeId.trim()),
  }
}

function normalizePreferencePerspective(
  preference: AgentThreadPreference,
): AgentThreadPreference {
  const stored = preference as StoredAgentThreadPreference
  const {
    activeProjectId: _activeProjectId,
    activeWorkspaceId: _activeWorkspaceId,
    ...withoutLegacy
  } = stored
  const perspective =
    normalizeScopePerspective(preference.activePerspective) ??
    legacyContainerPerspective(stored)
  if (perspective) {
    const unchanged =
      !("activeProjectId" in stored) &&
      !("activeWorkspaceId" in stored) &&
      preference.activePerspective?.focusScopeId === perspective.focusScopeId &&
      preference.activePerspective.viaScopeIds.every(
        (scopeId, index) => scopeId === perspective.viaScopeIds[index],
      )
    return unchanged
      ? preference
      : { ...withoutLegacy, activePerspective: perspective }
  }
  if (
    preference.activePerspective === undefined &&
    !("activeProjectId" in stored) &&
    !("activeWorkspaceId" in stored)
  ) {
    return preference
  }
  return withoutActivePerspective(withoutLegacy)
}

type StoredAgentThreadPreference = AgentThreadPreference & {
  activeProjectId?: string
  activeWorkspaceId?: string
}

function legacyContainerPerspective(
  container: StoredAgentThreadPreference,
): ScopePerspective | undefined {
  if (container.activeWorkspaceId) {
    return {
      focusScopeId: container.activeWorkspaceId,
      viaScopeIds: container.activeProjectId ? [container.activeProjectId] : [],
    }
  }
  return container.activeProjectId
    ? { focusScopeId: container.activeProjectId, viaScopeIds: [] }
    : undefined
}

function withoutActivePerspective(
  preference: AgentThreadPreference,
): AgentThreadPreference {
  const { activePerspective: _activePerspective, ...rest } = preference
  return rest
}

function threadKey(id: string): string {
  return `${THREAD_KEY_PREFIX}${id}`
}

function activeThreadKey(userId: string): string {
  return `${ACTIVE_THREAD_KEY_PREFIX}${userId}`
}

function hasMembers(
  record: Pick<AgentThread, "members"> | Pick<AgentThreadPreference, "members">,
): boolean {
  return Array.isArray(record.members)
}

function isMember(members: unknown, userId: string): boolean {
  return Array.isArray(members) && members.includes(userId)
}

type StoredAgentThread = Omit<AgentThread, "runtime"> & {
  runtime?: AgentThread["runtime"]
}

function freshRuntimeSession(): AgentRuntimeSessionState {
  return { streamIndex: 0 }
}

function freshRuntimeRecord(timestamp: string): AgentThread["runtime"] {
  return {
    schemaVersion: 1,
    session: freshRuntimeSession(),
    events: [],
    compaction: emptyCompaction(timestamp),
  }
}

function emptyCompaction(timestamp: string): AgentEventCompactionReceipt {
  return sanitizeAndBoundAgentEvents([], {
    now: () => new Date(timestamp),
  }).compaction
}

function cloneSession(
  session: AgentRuntimeSessionState,
): AgentRuntimeSessionState {
  return {
    ...(session.continuationToken
      ? { continuationToken: session.continuationToken }
      : {}),
    ...(session.sessionId ? { sessionId: session.sessionId } : {}),
    streamIndex: session.streamIndex,
  }
}

function snapshotMatchesRuntime(
  thread: AgentThread,
  snapshot: AgentThreadSnapshot,
): boolean {
  const retained = sanitizeAndBoundAgentEvents(snapshot.events, {
    now: () => new Date(thread.runtime.compaction.compactedAt),
  })
  return (
    JSON.stringify(thread.runtime.session) ===
      JSON.stringify(cloneSession(snapshot.session)) &&
    JSON.stringify(thread.runtime.events) === JSON.stringify(retained.events) &&
    thread.runtime.compaction.policyVersion ===
      retained.compaction.policyVersion &&
    thread.runtime.compaction.firstRetainedStreamIndex ===
      retained.compaction.firstRetainedStreamIndex &&
    thread.runtime.compaction.omittedEventCount ===
      retained.compaction.omittedEventCount
  )
}

function cloneThread(thread: AgentThread): AgentThread {
  return structuredClone(thread)
}

function cloneExecutionBinding(
  binding: AgentThreadExecutionBinding,
): AgentThreadExecutionBinding {
  return structuredClone(binding)
}

function assertRevision(thread: AgentThread, expectedRevision?: number): void {
  if (expectedRevision !== undefined && expectedRevision !== thread.revision) {
    throw new AgentThreadConflictError(
      thread.id,
      expectedRevision,
      thread.revision,
    )
  }
}
