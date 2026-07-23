import {
  artifactPublicUrl,
  createFileSessionArtifactStore,
  type ScopePrincipal,
  type SessionArtifactStore,
  type SessionArtifactMetadata,
} from "@workspace/artifact-store/repository"

import { assertAuthorizedScope } from "./agent-scope-authorization.server"
import type { SigilAuthSession } from "./auth/server"

export interface WebArtifactStoreDependencies {
  readonly getSession: () => Promise<SigilAuthSession | null>
  readonly ownedThreadHomeScope: (
    userId: string,
    threadId: string,
  ) => string | undefined
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
  assertAuthorizedScope(
    scope,
    candidate.user.id,
    dependencies.ownedThreadHomeScope,
    undefined,
    undefined,
    mode,
  )
  return {
    session: candidate,
    store: dependencies.store ?? getWebArtifactStore(),
    principal: { id: candidate.user.id },
  }
}
