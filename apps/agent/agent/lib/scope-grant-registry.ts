import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"
import type { ScopeGrant } from "@workspace/agent-contracts/scope-authorization"

import type { ScopeRecord } from "./scope-registry"

const GRANT_NAMESPACE = "sigil-chat.scope-grants.v1"

export interface ScopeGrantRecord extends ScopeGrant {
  readonly id: string
  readonly createdAt: string
  readonly createdBy: string
  readonly revokedAt?: string
  readonly revokedBy?: string
  readonly revision: number
}

export interface ScopeGrantScopeLookup {
  get(id: string): ScopeRecord | undefined
}

export interface ScopeGrantRegistryOptions {
  cwd?: string
  projectRoot?: string
  scopes: ScopeGrantScopeLookup
  store?: KvStore<unknown>
  now?: () => Date
  createId?: () => string
}

export interface CreateScopeGrantInput {
  readonly actions: readonly ScopeGrant["actions"][number][]
  readonly createdBy: string
  readonly principalId: string
  readonly resourceScope: string
}

/**
 * Durable grants are their own authorization data, never mounts or browser
 * perspective state. Every policy query calls listActive again so revocation
 * takes effect before the next read or tool call.
 */
export class ScopeGrantRegistry {
  private readonly grants: KvStore<unknown>
  private readonly now: () => Date
  private readonly createId: () => string

  constructor(private readonly options: ScopeGrantRegistryOptions) {
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? (() => crypto.randomUUID())
    if (options.store) {
      this.grants = options.store
      return
    }
    const scope = createScope({
      cwd: options.cwd ?? process.cwd(),
      projectRoot: options.projectRoot,
    })
    const provider = createStoreProvider(scope, {
      backendFactory: mirkBackendFactory(scope),
    })
    this.grants = provider.kv("project", GRANT_NAMESPACE)
  }

  get(id: string): ScopeGrantRecord | undefined {
    assertIdentifier("grant id", id)
    const value = this.grants.get(id)
    if (value === undefined) return undefined
    if (!isScopeGrantRecord(value) || value.id !== id) {
      throw new Error(`Scope grant registry is corrupt for ${id}.`)
    }
    return clone(value)
  }

  listActive(): ScopeGrant[] {
    return this.list().filter((grant) => grant.revokedAt === undefined)
  }

  list(): ScopeGrantRecord[] {
    return this.grants.entries().map(({ key, value }) => {
      if (!isScopeGrantRecord(value) || value.id !== key) {
        throw new Error(`Scope grant registry is corrupt for ${key}.`)
      }
      return clone(value)
    }).sort((left, right) => left.id.localeCompare(right.id))
  }

  create(input: CreateScopeGrantInput): ScopeGrantRecord {
    assertCreateInput(input)
    this.assertKnownResourceScope(input.resourceScope)
    const record: ScopeGrantRecord = {
      id: this.createId(),
      actions: [...input.actions],
      principalId: input.principalId,
      resourceScope: input.resourceScope,
      createdAt: this.now().toISOString(),
      createdBy: input.createdBy,
      revision: 1,
    }
    assertScopeGrantRecord(record)
    this.grants.set(record.id, clone(record))
    return clone(record)
  }

  revoke(id: string, revokedBy: string): ScopeGrantRecord {
    const current = this.get(id)
    if (!current) throw new Error(`Scope grant ${id} was not found.`)
    assertIdentifier("revoker id", revokedBy)
    if (current.revokedAt !== undefined) return current
    const revoked: ScopeGrantRecord = {
      ...current,
      revokedAt: this.now().toISOString(),
      revokedBy,
      revision: current.revision + 1,
    }
    assertScopeGrantRecord(revoked)
    this.grants.set(revoked.id, clone(revoked))
    return clone(revoked)
  }

  private assertKnownResourceScope(resourceScope: string): void {
    const parsed = parseResourceScope(resourceScope)
    const scope = parsed && this.options.scopes.get(parsed.id)
    if (!scope || scope.kind !== parsed.tier) {
      throw new Error(`Unknown scope grant resource: ${resourceScope}.`)
    }
  }
}

export function isScopeGrantRecord(value: unknown): value is ScopeGrantRecord {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, grantKeys) &&
    isIdentifier(value.id) &&
    isIdentifier(value.principalId) &&
    isResourceScope(value.resourceScope) &&
    Array.isArray(value.actions) &&
    value.actions.length > 0 &&
    value.actions.every(isAction) &&
    new Set(value.actions).size === value.actions.length &&
    isIdentifier(value.createdAt) &&
    isIdentifier(value.createdBy) &&
    (value.revokedAt === undefined || isIdentifier(value.revokedAt)) &&
    (value.revokedBy === undefined || isIdentifier(value.revokedBy)) &&
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision > 0
  )
}

const grantKeys = [
  "id",
  "actions",
  "principalId",
  "resourceScope",
  "createdAt",
  "createdBy",
  "revokedAt",
  "revokedBy",
  "revision",
] as const

function assertCreateInput(input: CreateScopeGrantInput): void {
  if (!isIdentifier(input.principalId)) throw new Error("Scope grant principal is invalid.")
  if (!isResourceScope(input.resourceScope)) throw new Error("Scope grant resource is invalid.")
  if (!isIdentifier(input.createdBy)) throw new Error("Scope grant creator is invalid.")
  if (
    !Array.isArray(input.actions) ||
    input.actions.length === 0 ||
    !input.actions.every(isAction) ||
    new Set(input.actions).size !== input.actions.length
  ) {
    throw new Error("Scope grant actions are invalid.")
  }
}

function assertScopeGrantRecord(value: ScopeGrantRecord): void {
  if (!isScopeGrantRecord(value)) throw new Error("Scope grant is invalid.")
}

function parseResourceScope(
  value: string,
): { id: string; tier: "project" | "workspace" } | undefined {
  const match = /^(project|workspace):([^\s:][^\s]*)$/.exec(value)
  if (!match) return undefined
  return {
    tier: match[1] === "project" ? "project" : "workspace",
    id: match[2]!,
  }
}

function isResourceScope(value: unknown): value is string {
  return typeof value === "string" && parseResourceScope(value) !== undefined
}

function isAction(value: unknown): value is ScopeGrant["actions"][number] {
  return value === "discover" || value === "read" || value === "tool"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function assertIdentifier(label: string, value: string): void {
  if (!isIdentifier(value)) throw new Error(`Scope ${label} must be non-empty.`)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
