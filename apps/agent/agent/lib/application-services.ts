import { createScope } from "@gonk/scope"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import { createSigilAgentToolRegistry } from "@workspace/agent-tools/registry"
import { createRequestBoundSkillRegistry } from "@workspace/agent-tools/skills"
import {
  createFileSessionArtifactStore,
  type ArtifactScopeAction,
} from "@workspace/artifact-store/repository"
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
import { resolvePersonaVoice } from "./memory"
import {
  MirkUsageLedgerRepository,
  type UsageAggregateBucket,
  type UsageLedgerRecord,
} from "./usage-ledger"

const usageScope = createScope({ cwd: process.cwd() })
const usageStore = createStoreProvider(usageScope, {
  backendFactory: mirkBackendFactory(usageScope),
})
export const usageLedgerRepository = new MirkUsageLedgerRepository({
  log: usageStore.log<UsageLedgerRecord>("project", "sigil-chat.usage-ledger.v1"),
  rollups: usageStore.kv<UsageAggregateBucket>(
    "project",
    "sigil-chat.usage-rollups.v1",
  ),
})

export const projectWorkspaceRegistries = getProjectWorkspaceRegistries()
export const scopeGrantPolicy = createScopeGrantPolicy({
  registries: projectWorkspaceRegistries,
})
export const threadScopeOwners = new MirkAgentThreadScopeOwnerRegistry()
export const eveSessionOwnerStore = new MirkEveSessionOwnerStore()

export const artifactStore = createFileSessionArtifactStore({
  canAccessScope: (principal, scope, action) =>
    canPrincipalAccessArtifactScope(principal?.id, scope, action),
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
  personaVoice: resolvePersonaVoice,
})

/**
 * The action is threaded through to the grant policy rather than pinned to
 * "read". A read-only grant on a container must not authorize writing
 * artifacts into it (SC.9, 2026-07-24). Members are unaffected: membership
 * fall-through in the policy still authorizes every action.
 */
export function canPrincipalAccessArtifactScope(
  principalId: string | undefined,
  scope: ResourceScope,
  action: ArtifactScopeAction,
): boolean {
  if (!principalId) return false
  const resourceScope = formatScopeHeader(scope)
  if (!resourceScope) return false
  if (scope.tier === "project" || scope.tier === "workspace") {
    return scopeGrantPolicy.authorize({
      action,
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
        action,
        principalId,
        resourceScope: homeScope,
      }),
    )
  }
  return false
}
