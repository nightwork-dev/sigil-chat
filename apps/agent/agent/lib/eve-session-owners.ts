import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"
import type {
  AgentSessionExecutionBinding,
  AgentSessionScopePerspective,
} from "@workspace/agent-contracts/session-binding"

const OWNER_NAMESPACE = "sigil-chat.eve-session-owners.v1"

interface EveSessionOwnerRecordV1 {
  sessionId: string
  subject: string
  version: 1
}

interface EveSessionOwnerRecordV2 {
  personaId: string
  sessionId: string
  subject: string
  version: 2
}

interface EveSessionOwnerRecordV3 extends AgentSessionExecutionBinding {
  sessionId: string
  subject: string
  version: 3
}

type EveSessionOwnerRecord =
  EveSessionOwnerRecordV1 | EveSessionOwnerRecordV2 | EveSessionOwnerRecordV3

export interface EveSessionBinding {
  additionalContextScopeIds?: string[]
  applicationThreadId?: string
  homeScopeId?: string
  initialPerspective?: AgentSessionScopePerspective
  personaId?: string
  subject: string
}

export interface EveSessionOwnerStore {
  bind(
    sessionId: string,
    subject: string,
    personaId: string,
    executionBinding?: AgentSessionExecutionBinding,
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
    super(`Eve session ${sessionId} is already bound to another principal.`)
    this.name = "EveSessionOwnerConflictError"
  }
}

/**
 * Immutable Eve-session ownership records on Gonk's Mirk-backed project KV.
 * Eve remains execution authority; this app-owned record is the fail-closed
 * authorization fact checked before Eve can resolve a resumed session.
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
    const scope = createScope({
      cwd,
      projectRoot: options.projectRoot,
    })
    const provider = createStoreProvider(scope, {
      backendFactory: mirkBackendFactory(scope),
    })
    this.owners = provider.kv("project", OWNER_NAMESPACE)
  }

  async bind(
    sessionId: string,
    subject: string,
    personaId: string,
    executionBinding?: AgentSessionExecutionBinding,
  ): Promise<void> {
    assertIdentifier("session id", sessionId)
    assertIdentifier("subject", subject)
    assertIdentifier("persona id", personaId)
    if (executionBinding) {
      assertExecutionBinding(executionBinding)
      if (executionBinding.personaId !== personaId) {
        throw new Error("Eve execution binding persona does not match.")
      }
    }

    await this.runExclusive(() => {
      const existing = this.readRecord(sessionId)
      if (existing?.subject === subject && existing.version === 3) {
        if (
          executionBinding &&
          existing.personaId === personaId &&
          executionBindingsEqual(existing, executionBinding)
        ) {
          return
        }
        throw new EveSessionOwnerConflictError(sessionId)
      }
      if (
        existing !== undefined &&
        (existing.subject !== subject ||
          (existing.version === 2 && existing.personaId !== personaId))
      ) {
        throw new EveSessionOwnerConflictError(sessionId)
      }
      this.owners.set(
        sessionId,
        executionBinding
          ? v3Record(sessionId, subject, executionBinding)
          : { personaId, sessionId, subject, version: 2 },
      )

      const persisted = this.readRecord(sessionId)
      if (
        persisted?.subject !== subject ||
        (executionBinding
          ? persisted.version !== 3 ||
            !executionBindingsEqual(persisted, executionBinding)
          : persisted.version !== 2 || persisted.personaId !== personaId)
      ) {
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
    if (!record) return undefined
    return {
      subject: record.subject,
      ...(record.version === 1
        ? {}
        : record.version === 2
          ? { personaId: record.personaId }
          : {
              applicationThreadId: record.applicationThreadId,
              personaId: record.personaId,
              homeScopeId: record.homeScopeId,
              initialPerspective: structuredClone(record.initialPerspective),
              additionalContextScopeIds: [...record.additionalContextScopeIds],
            }),
    }
  }

  private readRecord(sessionId: string): EveSessionOwnerRecord | undefined {
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
    personaId: string,
    executionBinding?: AgentSessionExecutionBinding,
  ): Promise<void> {
    if (executionBinding) {
      assertExecutionBinding(executionBinding)
      if (executionBinding.personaId !== personaId) {
        throw new Error("Eve execution binding persona does not match.")
      }
    }
    const existing = this.owners.get(sessionId)
    const requested: EveSessionBinding = {
      subject,
      personaId,
      ...(executionBinding ? structuredClone(executionBinding) : {}),
    }
    if (existing && bindingsEqual(existing, requested)) return
    if (
      existing?.subject === subject &&
      existing.personaId === personaId &&
      existing.applicationThreadId === undefined &&
      executionBinding
    ) {
      this.owners.set(sessionId, requested)
      return
    }
    if (existing !== undefined) {
      throw new EveSessionOwnerConflictError(sessionId)
    }
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

function isOwnerRecord(value: unknown): value is EveSessionOwnerRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    (record.version === 1 || record.version === 2 || record.version === 3) &&
    typeof record.sessionId === "string" &&
    record.sessionId.length > 0 &&
    typeof record.subject === "string" &&
    record.subject.length > 0 &&
    (record.version === 1 ||
      (typeof record.personaId === "string" &&
        record.personaId.length > 0 &&
        (record.version === 2 || isExecutionBinding(record))))
  )
}

function v3Record(
  sessionId: string,
  subject: string,
  binding: AgentSessionExecutionBinding,
): EveSessionOwnerRecordV3 {
  return {
    ...structuredClone(binding),
    sessionId,
    subject,
    version: 3,
  }
}

function executionBindingsEqual(
  left: AgentSessionExecutionBinding,
  right: AgentSessionExecutionBinding,
): boolean {
  return (
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

function bindingsEqual(
  left: EveSessionBinding,
  right: EveSessionBinding,
): boolean {
  if (left.subject !== right.subject || left.personaId !== right.personaId) {
    return false
  }
  if (
    left.applicationThreadId === undefined ||
    right.applicationThreadId === undefined
  ) {
    return (
      left.applicationThreadId === right.applicationThreadId &&
      left.homeScopeId === right.homeScopeId
    )
  }
  return executionBindingsEqual(
    left as AgentSessionExecutionBinding,
    right as AgentSessionExecutionBinding,
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
  if (!value.trim()) throw new Error(`Eve ${label} must be non-empty.`)
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}
