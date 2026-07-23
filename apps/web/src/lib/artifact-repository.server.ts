import {
  artifactPublicUrl,
  createFileSessionArtifactStore,
  type ScopePrincipal,
  type SessionArtifactStore,
  type SessionArtifactMetadata,
} from "@workspace/artifact-store/repository"

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
  webArtifactStore ??= createFileSessionArtifactStore()
  return webArtifactStore
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
