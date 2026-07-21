import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

const PERSONAL_SCOPE_NAMESPACE = "sigil-chat.personal-scopes.v1"
const PERSONAL_SCOPE_PREFIX = "personal-scope:"
export const INSTALLATION_SCOPE_ID = "installation:default"

export interface PersonalScope {
  readonly id: string
  readonly principalId: string
  readonly name: string
  readonly description: string
  readonly homeScopeId: string
  readonly status: "active" | "archived"
  readonly createdAt: string
  readonly createdBy: string
  readonly revision: number
}

export interface PersonalScopeRegistryOptions {
  cwd?: string
  projectRoot?: string
  store?: KvStore<unknown>
}

/**
 * Principal-owned personal scopes are real scope records, not the legacy
 * personal-project navigation fallback. They are materialized only by callers
 * that need a private personal-agent resource home.
 */
export class PersonalScopeRegistry {
  private readonly scopes: KvStore<unknown>

  constructor(options: PersonalScopeRegistryOptions = {}) {
    if (options.store) {
      this.scopes = options.store
      return
    }

    const scope = createScope({
      cwd: options.cwd ?? process.cwd(),
      projectRoot: options.projectRoot,
    })
    const provider = createStoreProvider(scope, {
      backendFactory: mirkBackendFactory(scope),
    })
    this.scopes = provider.kv("project", PERSONAL_SCOPE_NAMESPACE)
  }

  get(id: string): PersonalScope | undefined {
    assertIdentifier("personal scope id", id)
    const value = this.scopes.get(id)
    if (value === undefined) return undefined
    if (!isPersonalScope(value) || value.id !== id) {
      throw new Error(`Personal scope registry is corrupt for ${id}.`)
    }
    return clone(value)
  }

  getForPrincipal(principalId: string): PersonalScope | undefined {
    return this.get(personalScopeId(principalId))
  }

  ensureForPrincipal(
    principalId: string,
    options: { now?: () => Date } = {},
  ): PersonalScope {
    const id = personalScopeId(principalId)
    const existing = this.get(id)
    if (existing) {
      if (existing.principalId !== principalId) {
        throw new Error(`Personal scope ${id} belongs to a different principal.`)
      }
      return existing
    }

    const timestamp = (options.now?.() ?? new Date()).toISOString()
    this.scopes.set(id, {
      id,
      principalId,
      name: "Personal scope",
      description: "Private home for a principal's personal agent continuity.",
      homeScopeId: INSTALLATION_SCOPE_ID,
      status: "active",
      createdAt: timestamp,
      createdBy: principalId,
      revision: 1,
    })
    const persisted = this.get(id)
    if (!persisted) {
      throw new Error(`Personal scope record did not persist for ${id}.`)
    }
    return persisted
  }
}

export function personalScopeId(principalId: string): string {
  const normalized = principalId.trim()
  if (!normalized) throw new Error("Principal id must be non-empty.")
  return `${PERSONAL_SCOPE_PREFIX}${normalized}`
}

export function isPersonalScope(value: unknown): value is PersonalScope {
  if (!isRecord(value) || !hasOnlyKeys(value, personalScopeKeys)) return false
  return (
    isIdentifier(value.id) &&
    isIdentifier(value.principalId) &&
    isIdentifier(value.name) &&
    typeof value.description === "string" &&
    value.homeScopeId === INSTALLATION_SCOPE_ID &&
    (value.status === "active" || value.status === "archived") &&
    isIdentifier(value.createdAt) &&
    value.createdBy === value.principalId &&
    typeof value.revision === "number" &&
    Number.isInteger(value.revision) &&
    value.revision > 0
  )
}

const personalScopeKeys = [
  "id",
  "principalId",
  "name",
  "description",
  "homeScopeId",
  "status",
  "createdAt",
  "createdBy",
  "revision",
] as const

function assertIdentifier(label: string, value: string): void {
  if (!isIdentifier(value)) {
    throw new Error(`Personal scope ${label} must be non-empty.`)
  }
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
