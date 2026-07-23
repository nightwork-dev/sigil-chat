import {
  artifactPublicUrl,
  createFileSessionArtifactStore,
  type CanAccessScope,
  type ScopePrincipal,
  type SessionArtifactStore,
  type SessionArtifactMetadata,
} from "@workspace/artifact-store/repository"
import { formatScopeHeader } from "@workspace/artifact-store/scope"

import { assertAuthorizedScope } from "./agent-scope-authorization.server"
import type { ScopeAuthorizationRegistries } from "../../../agent/agent/lib/scope-authorization"
import type { ScopeAuthorizationPolicy } from "@workspace/agent-contracts/scope-authorization"
import type { SigilAuthSession } from "./auth/server"

export interface WebArtifactStoreDependencies {
  readonly getSession: () => Promise<SigilAuthSession | null>
  readonly ownedThreadHomeScope: (
    userId: string,
    threadId: string,
  ) => string | undefined
  readonly policy?: ScopeAuthorizationPolicy
  readonly registries?: ScopeAuthorizationRegistries
  readonly store?: SessionArtifactStore
}

let webArtifactStore: SessionArtifactStore | undefined

export function getWebArtifactStore(): SessionArtifactStore {
  webArtifactStore ??= createFileSessionArtifactStore({
    canAccessScope: createWebArtifactScopeAccessCheck(),
  })
  return webArtifactStore
}

export function createWebArtifactScopeAccessCheck(
  dependencies: Partial<
    Pick<
      WebArtifactStoreDependencies,
      "ownedThreadHomeScope" | "policy" | "registries"
    >
  > = {},
): CanAccessScope {
  return async (principal, scope) => {
    if (!principal?.id) return false
    const resourceScope = formatScopeHeader(scope)
    if (!resourceScope) return false

    let ownedThreadHomeScope = dependencies.ownedThreadHomeScope
    if (!ownedThreadHomeScope) {
      const { agentThreadRepository } = await import("./agent-threads.server")
      ownedThreadHomeScope = (userId, threadId) =>
        agentThreadRepository.get(userId, threadId)?.executionBinding
          ?.homeScopeId
    }

    try {
      assertAuthorizedScope(
        resourceScope,
        principal.id,
        ownedThreadHomeScope,
        dependencies.registries,
        dependencies.policy,
      )
      return true
    } catch {
      return false
    }
  }
}

export function artifactUrlForWeb(
  artifact: Pick<SessionArtifactMetadata, "id" | "scope">,
): string {
  return artifactPublicUrl(artifact.id, artifact.scope)
}

export async function authorizeArtifactScope(
  scope: string,
  dependencies: WebArtifactStoreDependencies,
  mode: "read" | "tool" = "read",
): Promise<{
  readonly session: SigilAuthSession
  readonly store: SessionArtifactStore
  readonly principal: ScopePrincipal
}> {
  const candidate = await dependencies.getSession()
  const { requireSession } = await import("./auth/session")
  const assertSession: (
    value: SigilAuthSession | null,
  ) => asserts value is SigilAuthSession = requireSession
  assertSession(candidate)
  return authorizeArtifactScopeForSession(scope, candidate, dependencies, mode)
}

export function authorizeArtifactScopeForSession(
  scope: string,
  session: SigilAuthSession,
  dependencies: WebArtifactStoreDependencies,
  mode: "read" | "tool" = "read",
): {
  readonly session: SigilAuthSession
  readonly store: SessionArtifactStore
  readonly principal: ScopePrincipal
} {
  assertAuthorizedScope(
    scope,
    session.user.id,
    dependencies.ownedThreadHomeScope,
    dependencies.registries,
    dependencies.policy,
    mode,
  )
  return {
    session,
    store: dependencies.store ?? getWebArtifactStore(),
    principal: { id: session.user.id },
  }
}
