import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

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

type EveSessionOwnerRecord = EveSessionOwnerRecordV1 | EveSessionOwnerRecordV2

export interface EveSessionBinding {
  personaId?: string
  subject: string
}

export interface EveSessionOwnerStore {
  bind(sessionId: string, subject: string, personaId: string): Promise<void>
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
  ): Promise<void> {
    assertIdentifier("session id", sessionId)
    assertIdentifier("subject", subject)
    assertIdentifier("persona id", personaId)

    await this.runExclusive(() => {
      const existing = this.readRecord(sessionId)
      if (
        existing?.subject === subject &&
        (existing.version === 1 || existing.personaId === personaId)
      ) {
        if (existing.version === 1) {
          this.owners.set(sessionId, {
            personaId,
            sessionId,
            subject,
            version: 2,
          })
        }
        return
      }
      if (existing !== undefined) {
        throw new EveSessionOwnerConflictError(sessionId)
      }
      this.owners.set(sessionId, {
        personaId,
        sessionId,
        subject,
        version: 2,
      })

      const persisted = this.readRecord(sessionId)
      if (
        persisted?.subject !== subject ||
        persisted.version !== 2 ||
        persisted.personaId !== personaId
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
      ...(record.version === 2 ? { personaId: record.personaId } : {}),
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
  ): Promise<void> {
    const existing = this.owners.get(sessionId)
    if (existing?.subject === subject && existing.personaId === personaId)
      return
    if (existing !== undefined) {
      throw new EveSessionOwnerConflictError(sessionId)
    }
    this.owners.set(sessionId, { personaId, subject })
  }

  async getOwner(sessionId: string): Promise<string | undefined> {
    return this.owners.get(sessionId)?.subject
  }

  async getBinding(sessionId: string): Promise<EveSessionBinding | undefined> {
    return this.owners.get(sessionId)
  }
}

function isOwnerRecord(value: unknown): value is EveSessionOwnerRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    (record.version === 1 || record.version === 2) &&
    typeof record.sessionId === "string" &&
    record.sessionId.length > 0 &&
    typeof record.subject === "string" &&
    record.subject.length > 0 &&
    (record.version === 1 ||
      (typeof record.personaId === "string" && record.personaId.length > 0))
  )
}

function assertIdentifier(label: string, value: string): void {
  if (!value.trim()) throw new Error(`Eve ${label} must be non-empty.`)
}
