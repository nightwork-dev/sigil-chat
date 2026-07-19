import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

const OWNER_NAMESPACE = "sigil-chat.eve-session-owners.v1"

interface EveSessionOwnerRecord {
  sessionId: string
  subject: string
  version: 1
}

export interface EveSessionOwnerStore {
  bind(sessionId: string, subject: string): Promise<void>
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

  async bind(sessionId: string, subject: string): Promise<void> {
    assertIdentifier("session id", sessionId)
    assertIdentifier("subject", subject)

    await this.runExclusive(() => {
      const existing = this.readRecord(sessionId)
      if (existing?.subject === subject) return
      if (existing !== undefined) {
        throw new EveSessionOwnerConflictError(sessionId)
      }
      this.owners.set(sessionId, { sessionId, subject, version: 1 })

      const persisted = this.readRecord(sessionId)
      if (persisted?.subject !== subject) {
        throw new Error(
          `Eve session-owner binding did not persist for ${sessionId}.`,
        )
      }
    })
  }

  async getOwner(sessionId: string): Promise<string | undefined> {
    assertIdentifier("session id", sessionId)
    return this.readRecord(sessionId)?.subject
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
  private readonly owners = new Map<string, string>()

  async bind(sessionId: string, subject: string): Promise<void> {
    const existing = this.owners.get(sessionId)
    if (existing === subject) return
    if (existing !== undefined) {
      throw new EveSessionOwnerConflictError(sessionId)
    }
    this.owners.set(sessionId, subject)
  }

  async getOwner(sessionId: string): Promise<string | undefined> {
    return this.owners.get(sessionId)
  }
}

function isOwnerRecord(value: unknown): value is EveSessionOwnerRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    record.version === 1 &&
    typeof record.sessionId === "string" &&
    record.sessionId.length > 0 &&
    typeof record.subject === "string" &&
    record.subject.length > 0
  )
}

function assertIdentifier(label: string, value: string): void {
  if (!value.trim()) throw new Error(`Eve ${label} must be non-empty.`)
}
