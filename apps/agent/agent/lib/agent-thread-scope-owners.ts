import { createScope } from "@gonk/scope"
import { createStoreProvider, mirkBackendFactory } from "@gonk/store"
import type { KvStore } from "@gonk/store/types"

const AGENT_THREAD_NAMESPACE = "sigil-chat.agent-threads.v1"
const THREAD_KEY_PREFIX = "thread:"

export interface AgentThreadScopeOwnerRegistryOptions {
  store?: KvStore<unknown>
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
    if (!isIdentifier(sessionId) || !isIdentifier(principalId)) return false
    const record = this.threads.get(`${THREAD_KEY_PREFIX}${sessionId}`)
    return isOwnedAgentThread(record, sessionId, principalId)
  }
}

function isOwnedAgentThread(
  value: unknown,
  sessionId: string,
  principalId: string,
): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    record.id === sessionId &&
    Array.isArray(record.members) &&
    record.members.includes(principalId)
  )
}

function isIdentifier(value: string): boolean {
  return value.trim().length > 0
}
