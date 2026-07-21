import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"
import type {
  AgentSessionExecutionBinding,
  AgentSessionScopePerspective,
} from "@workspace/agent-contracts/session-binding"

const OWNER_NAMESPACE = "sigil-chat.eve-session-owners.v3"

interface EveSessionOwnerRecordV3 extends AgentSessionExecutionBinding {
  sessionId: string
  subject: string
  version: 3
}

export interface EveSessionBinding extends AgentSessionExecutionBinding {
  subject: string
}

export interface EveSessionOwnerStore {
  bind(
    sessionId: string,
    subject: string,
    executionBinding: AgentSessionExecutionBinding,
  ): Promise<void>
  getBinding(sessionId: string): Promise<EveSessionBinding | undefined>
  getOwner(sessionId: string): Promise<string | undefined>
}

export interface MirkEveSessionOwnerStoreOptions {
  cwd?: string
  projectRoot?: string
  store?: KvStore<unknown>
}

export class EveSessionOwnerConflictError extends Error {
  constructor(readonly sessionId: string) {
    super(
      `Eve session ${sessionId} is already bound to another execution context.`,
    )
    this.name = "EveSessionOwnerConflictError"
  }
}

/**
 * Clean-install V3 store. Every Eve session is born with its complete immutable
 * application-thread binding; incomplete legacy records are intentionally not
 * read or promoted.
 */
export class MirkEveSessionOwnerStore implements EveSessionOwnerStore {
  private readonly owners: KvStore<unknown>
  private queue: Promise<unknown> = Promise.resolve()

  constructor(options: MirkEveSessionOwnerStoreOptions = {}) {
    if (options.store) {
      this.owners = options.store
      return
    }
    const cwd = options.cwd ?? process.cwd()
    const scope = createScope({ cwd, projectRoot: options.projectRoot })
    const provider = createStoreProvider(scope, {
      backendFactory: mirkBackendFactory(scope),
    })
    this.owners = provider.kv("project", OWNER_NAMESPACE)
  }

  async bind(
    sessionId: string,
    subject: string,
    executionBinding: AgentSessionExecutionBinding,
  ): Promise<void> {
    assertIdentifier("session id", sessionId)
    assertIdentifier("subject", subject)
    assertExecutionBinding(executionBinding)

    await this.runExclusive(() => {
      const requested = v3Record(sessionId, subject, executionBinding)
      const existing = this.readRecord(sessionId)
      if (existing && recordsEqual(existing, requested)) return
      if (existing) throw new EveSessionOwnerConflictError(sessionId)

      this.owners.set(sessionId, requested)
      const persisted = this.readRecord(sessionId)
      if (!persisted || !recordsEqual(persisted, requested)) {
        throw new Error(
          `Eve session-owner binding did not persist for ${sessionId}.`,
        )
      }
    })
  }

  async getOwner(sessionId: string): Promise<string | undefined> {
    return (await this.getBinding(sessionId))?.subject
  }

  async getBinding(sessionId: string): Promise<EveSessionBinding | undefined> {
    assertIdentifier("session id", sessionId)
    const record = this.readRecord(sessionId)
    return record ? bindingFromRecord(record) : undefined
  }

  private readRecord(sessionId: string): EveSessionOwnerRecordV3 | undefined {
    const value = this.owners.get(sessionId)
    if (value === undefined) return undefined
    if (!isOwnerRecord(value) || value.sessionId !== sessionId) {
      throw new Error(
        `Eve session-owner store is corrupt for session ${sessionId}.`,
      )
    }
    return value
  }

  private runExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation)
    this.queue = run.catch(() => undefined)
    return run
  }
}

export class MemoryEveSessionOwnerStore implements EveSessionOwnerStore {
  private readonly owners = new Map<string, EveSessionBinding>()

  async bind(
    sessionId: string,
    subject: string,
    executionBinding: AgentSessionExecutionBinding,
  ): Promise<void> {
    assertIdentifier("session id", sessionId)
    assertIdentifier("subject", subject)
    assertExecutionBinding(executionBinding)
    const requested = { subject, ...structuredClone(executionBinding) }
    const existing = this.owners.get(sessionId)
    if (existing && bindingsEqual(existing, requested)) return
    if (existing) throw new EveSessionOwnerConflictError(sessionId)
    this.owners.set(sessionId, requested)
  }

  async getOwner(sessionId: string): Promise<string | undefined> {
    return this.owners.get(sessionId)?.subject
  }

  async getBinding(sessionId: string): Promise<EveSessionBinding | undefined> {
    const binding = this.owners.get(sessionId)
    return binding ? structuredClone(binding) : undefined
  }
}

function bindingFromRecord(record: EveSessionOwnerRecordV3): EveSessionBinding {
  return {
    subject: record.subject,
    applicationThreadId: record.applicationThreadId,
    personaId: record.personaId,
    homeScopeId: record.homeScopeId,
    initialPerspective: structuredClone(record.initialPerspective),
    additionalContextScopeIds: [...record.additionalContextScopeIds],
  }
}

function v3Record(
  sessionId: string,
  subject: string,
  binding: AgentSessionExecutionBinding,
): EveSessionOwnerRecordV3 {
  return { ...structuredClone(binding), sessionId, subject, version: 3 }
}

function recordsEqual(
  left: EveSessionOwnerRecordV3,
  right: EveSessionOwnerRecordV3,
): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.version === right.version &&
    bindingsEqual(bindingFromRecord(left), bindingFromRecord(right))
  )
}

function bindingsEqual(
  left: EveSessionBinding,
  right: EveSessionBinding,
): boolean {
  return (
    left.subject === right.subject &&
    left.applicationThreadId === right.applicationThreadId &&
    left.personaId === right.personaId &&
    left.homeScopeId === right.homeScopeId &&
    left.initialPerspective.focusScopeId ===
      right.initialPerspective.focusScopeId &&
    arraysEqual(
      left.initialPerspective.viaScopeIds,
      right.initialPerspective.viaScopeIds,
    ) &&
    arraysEqual(left.additionalContextScopeIds, right.additionalContextScopeIds)
  )
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function isOwnerRecord(value: unknown): value is EveSessionOwnerRecordV3 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    record.version === 3 &&
    isIdentifier(record.sessionId) &&
    isIdentifier(record.subject) &&
    isExecutionBinding(record)
  )
}

function isExecutionBinding(
  value: Record<string, unknown>,
): value is Record<string, unknown> & AgentSessionExecutionBinding {
  return (
    isIdentifier(value.applicationThreadId) &&
    isIdentifier(value.personaId) &&
    isIdentifier(value.homeScopeId) &&
    isPerspective(value.initialPerspective) &&
    Array.isArray(value.additionalContextScopeIds) &&
    value.additionalContextScopeIds.every(isIdentifier)
  )
}

function isPerspective(value: unknown): value is AgentSessionScopePerspective {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const perspective = value as Record<string, unknown>
  return (
    isIdentifier(perspective.focusScopeId) &&
    Array.isArray(perspective.viaScopeIds) &&
    perspective.viaScopeIds.every(isIdentifier)
  )
}

function assertExecutionBinding(binding: AgentSessionExecutionBinding): void {
  if (!isExecutionBinding(binding as unknown as Record<string, unknown>)) {
    throw new Error("Eve execution binding is invalid.")
  }
}

function assertIdentifier(label: string, value: string): void {
  if (!isIdentifier(value)) throw new Error(`Eve ${label} must be non-empty.`)
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}
