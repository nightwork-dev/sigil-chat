import type { SigilAuthSession } from "./auth/server"
import { AuthenticationRequiredError } from "./auth/session"
import {
  assertAuthorizedScope,
  type OwnedThreadHomeScope,
} from "./agent-scope-authorization.server"
import { blackboardStoreKey, type BlackboardScope } from "./blackboard-scope"
import type { ScopeAuthorizationRegistries } from "../../../agent/agent/lib/scope-authorization"
import type { ScopeAuthorizationAction } from "@workspace/agent-contracts/scope-authorization"
import type {
  BlackboardDoc,
  BlackboardRepository,
} from "@workspace/blackboard-store"

interface ThreadLookup {
  get(userId: string, threadId: string): unknown
}

export function requireBlackboardAccess(
  session: SigilAuthSession | null,
  sessionId: string,
  ownsThread: (userId: string, threadId: string) => boolean,
): SigilAuthSession {
  if (!session) throw new AuthenticationRequiredError()
  if (!ownsThread(session.user.id, sessionId)) {
    throw new Error("Agent session was not found.")
  }
  return session
}

export async function readOwnedBlackboard(
  session: SigilAuthSession | null,
  sessionId: string,
  threads: ThreadLookup,
  blackboards: BlackboardRepository,
): Promise<BlackboardDoc> {
  requireBlackboardAccess(session, sessionId, (userId, threadId) =>
    Boolean(threads.get(userId, threadId)),
  )
  return blackboards.read(sessionId)
}

export async function writeOwnedBlackboard(
  session: SigilAuthSession | null,
  input: { sessionId: string; content: string; expectedRevision: string },
  threads: ThreadLookup,
  blackboards: BlackboardRepository,
): Promise<BlackboardDoc> {
  requireBlackboardAccess(session, input.sessionId, (userId, threadId) =>
    Boolean(threads.get(userId, threadId)),
  )
  return blackboards.write(
    input.sessionId,
    input.content,
    "user",
    input.expectedRevision,
  )
}

/**
 * The workspace/project tiers' shared scratch surface — same store, keyed by
 * `blackboardStoreKey(scope)` (blackboard-scope.ts) instead of a bare thread
 * id. Session-tier access still goes through `readOwnedBlackboard`/
 * `writeOwnedBlackboard` above (unchanged, thread-ownership gated); this path
 * covers workspace/project via the registry-backed membership check that
 * already guards Eve's tool scope (`assertAuthorizedScope`), so a container
 * blackboard opens to the same people who can act in that container.
 */
export function requireBlackboardScopeAccess(
  session: SigilAuthSession | null,
  scope: BlackboardScope,
  ownedThreadHomeScope: OwnedThreadHomeScope,
  registries?: ScopeAuthorizationRegistries,
  action: ScopeAuthorizationAction = "read",
): SigilAuthSession {
  if (!session) throw new AuthenticationRequiredError()
  assertAuthorizedScope(
    `${scope.tier}:${scope.id}`,
    session.user.id,
    ownedThreadHomeScope,
    registries,
    undefined,
    action,
  )
  return session
}

export async function readScopedBlackboard(
  session: SigilAuthSession | null,
  scope: BlackboardScope,
  ownedThreadHomeScope: OwnedThreadHomeScope,
  blackboards: BlackboardRepository,
  registries?: ScopeAuthorizationRegistries,
): Promise<BlackboardDoc> {
  requireBlackboardScopeAccess(
    session,
    scope,
    ownedThreadHomeScope,
    registries,
    "read",
  )
  return blackboards.read(blackboardStoreKey(scope))
}

export async function writeScopedBlackboard(
  session: SigilAuthSession | null,
  input: { scope: BlackboardScope; content: string; expectedRevision: string },
  ownedThreadHomeScope: OwnedThreadHomeScope,
  blackboards: BlackboardRepository,
  registries?: ScopeAuthorizationRegistries,
): Promise<BlackboardDoc> {
  requireBlackboardScopeAccess(
    session,
    input.scope,
    ownedThreadHomeScope,
    registries,
    "tool",
  )
  return blackboards.write(
    blackboardStoreKey(input.scope),
    input.content,
    "user",
    input.expectedRevision,
  )
}
