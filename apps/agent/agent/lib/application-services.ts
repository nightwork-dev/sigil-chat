import { createSigilAgentToolRegistry } from "@workspace/agent-tools/registry"
import { createRequestBoundSkillRegistry } from "@workspace/agent-tools/skills"
import { createFileSessionArtifactStore } from "@workspace/artifact-store/repository"
import {
  formatScopeHeader,
  type ResourceScope,
} from "@workspace/artifact-store/scope"
import { graphRepository } from "@workspace/graph-store/repository"
import { reviewRepository } from "@workspace/review-store"
import { readDataEnvironment } from "@workspace/runtime-env/server"
import { workItemsRepository } from "@workspace/work-items-store"
import { specsRepository } from "@workspace/work-items-store/specs"

import { MirkAgentThreadScopeOwnerRegistry } from "./agent-thread-scope-owners"
import { MirkEveSessionOwnerStore } from "./eve-session-owners"
import { personalScopeId } from "./personal-scope"
import { getProjectWorkspaceRegistries } from "./project-workspace-registries"
import { createScopeGrantPolicy } from "./scope-authorization"

export const projectWorkspaceRegistries = getProjectWorkspaceRegistries()
export const scopeGrantPolicy = createScopeGrantPolicy({
  registries: projectWorkspaceRegistries,
})
export const threadScopeOwners = new MirkAgentThreadScopeOwnerRegistry()
export const eveSessionOwnerStore = new MirkEveSessionOwnerStore()

export const artifactStore = createFileSessionArtifactStore({
  canAccessScope: (principal, scope) =>
    canPrincipalAccessArtifactScope(principal?.id, scope),
})

export const agentToolRegistry = createSigilAgentToolRegistry({
  artifacts: artifactStore,
  containers: projectWorkspaceRegistries,
  graph: graphRepository,
  reviews: reviewRepository,
  skills: createRequestBoundSkillRegistry(
    readDataEnvironment(process.env).skillsDir,
  ),
  sessions: {
    listOwned: (principalId) => threadScopeOwners.listOwned(principalId),
  },
  specs: specsRepository,
  workItems: workItemsRepository,
})

export function canPrincipalAccessArtifactScope(
  principalId: string | undefined,
  scope: ResourceScope,
): boolean {
  if (!principalId) return false
  const resourceScope = formatScopeHeader(scope)
  if (!resourceScope) return false
  if (scope.tier === "project" || scope.tier === "workspace") {
    return scopeGrantPolicy.authorize({
      action: "read",
      principalId,
      resourceScope,
    })
  }
  if (scope.tier === "session") {
    const homeScopeId = threadScopeOwners.homeScopeId(scope.id, principalId)
    if (!homeScopeId) return false
    if (homeScopeId === personalScopeId(principalId)) return true
    const homeScope = projectWorkspaceRegistries.workspaces.get(homeScopeId)
      ? `workspace:${homeScopeId}`
      : projectWorkspaceRegistries.projects.get(homeScopeId)
        ? `project:${homeScopeId}`
        : undefined
    return Boolean(
      homeScope &&
      scopeGrantPolicy.authorize({
        action: "read",
        principalId,
        resourceScope: homeScope,
      }),
    )
  }
  return false
}
