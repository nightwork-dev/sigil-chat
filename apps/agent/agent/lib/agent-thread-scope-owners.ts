import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

const AGENT_THREAD_NAMESPACE = "sigil-chat.agent-threads.v1"
const THREAD_KEY_PREFIX = "thread:"

export interface AgentThreadScopeOwnerRegistryOptions {
  store?: KvStore<unknown>
}

export interface OwnedAgentThreadScope {
  readonly id: string
  readonly homeScopeId: string
  readonly title: string
  readonly updatedAt: string
}

/**
 * Read-only view of the web-owned thread records. Gonk never mirrors or
 * mutates session ownership: every delegated session scope reads the current
 * member list, so removal/deletion takes effect on the next tool call.
 */
export class MirkAgentThreadScopeOwnerRegistry {
  private readonly threads: KvStore<unknown>

  constructor(options: AgentThreadScopeOwnerRegistryOptions = {}) {
    if (options.store) {
      this.threads = options.store
      return
    }
    const scope = createScope({ cwd: process.cwd() })
    const provider = createStoreProvider(scope, {
      backendFactory: mirkBackendFactory(scope),
    })
    this.threads = provider.kv("project", AGENT_THREAD_NAMESPACE)
  }

  owns(sessionId: string, principalId: string): boolean {
    return this.homeScopeId(sessionId, principalId) !== undefined
  }

  homeScopeId(sessionId: string, principalId: string): string | undefined {
    if (!isIdentifier(sessionId) || !isIdentifier(principalId)) return undefined
    const record = this.threads.get(`${THREAD_KEY_PREFIX}${sessionId}`)
    return ownedThreadHomeScope(record, sessionId, principalId)
  }

  listOwned(principalId: string): OwnedAgentThreadScope[] {
    if (!isIdentifier(principalId)) return []
    return this.threads
      .entries(THREAD_KEY_PREFIX)
      .map(({ value }) => ownedThread(value, principalId))
      .filter((value): value is OwnedAgentThreadScope => value !== undefined)
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          left.id.localeCompare(right.id),
      )
  }
}

function ownedThread(
  value: unknown,
  principalId: string,
): OwnedAgentThreadScope | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const binding = isRecord(record.executionBinding)
    ? record.executionBinding
    : undefined
  if (
    !isIdentifierValue(record.id) ||
    !isIdentifierValue(record.title) ||
    !isIdentifierValue(record.updatedAt) ||
    !isIdentifierValue(binding?.homeScopeId) ||
    !Array.isArray(record.members) ||
    !record.members.includes(principalId)
  ) {
    return undefined
  }
  return {
    id: record.id,
    homeScopeId: binding.homeScopeId,
    title: record.title,
    updatedAt: record.updatedAt,
  }
}

function ownedThreadHomeScope(
  value: unknown,
  sessionId: string,
  principalId: string,
): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined
  }
  const record = value as Record<string, unknown>
  if (
    record.id === sessionId &&
    Array.isArray(record.members) &&
    record.members.includes(principalId)
  ) {
    const binding = isRecord(record.executionBinding)
      ? record.executionBinding
      : undefined
    return isIdentifierValue(binding?.homeScopeId)
      ? binding.homeScopeId
      : undefined
  }
  return undefined
}

function isIdentifier(value: string): boolean {
  return value.trim().length > 0
}

function isIdentifierValue(value: unknown): value is string {
  return typeof value === "string" && isIdentifier(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
