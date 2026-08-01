import { createScope } from "@gonk/scope"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import {
  IMAGE_GENERATE_CAPABILITY,
  createImageGenerateCapability,
} from "@gonk/image-gen"
import {
  createEveFabricHostFromEnvironment,
  fabricCapabilityCoordinate,
  fabricExecutionBindingDigest,
  type EveFabricToolHostContext,
  type FabricDispatchMetadataV1,
} from "@gonk/eve-host/fabric"
import type { ToolContext } from "@gonk/tool-registry"
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
import { resolveSigilProjectRoot } from "@workspace/runtime-env/project-root"
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

// `createScope({ cwd })` alone walks from `cwd` for a root marker
// (`.gonk`/`.claude`/`.agents`/`agents`/`.git`) and, finding none, falls back
// to the real user home for the project tier (@gonk/scope's
// `scopeStateHome`/`resolveTierHomes` fallback). The agent app's own
// cold-boot smoke test runs Eve from a scratch tmpdir that deliberately has
// none of those markers (only `agent/`, `fixtures/`, and `package.json`), so
// an unqualified `createScope` here durably wrote `sigil-chat.usage-*`
// namespaces into the real `~/.agents/store` on every local/CI run. Passing
// an explicit `projectRoot` — resolved the same way the fixture loader
// resolves it, by walking for `fixtures/application/sigil-chat.yaml` or a
// `package.json` named `sigil-chat` — pins the project tier to a directory
// that is always real for this repo (the worktree root, or the smoke
// script's copied fixture tree), so the store never silently escapes into
// the operator's home.
const usageScope = createScope({
  cwd: process.cwd(),
  projectRoot: resolveSigilProjectRoot(process.cwd()),
})
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

export const eveFabricHost = await createEveFabricHostFromEnvironment({
  scopeOrStore: usageStore,
})

const portableImageGeneration = eveFabricHost?.bind(
  createImageGenerateCapability(async () => {
    throw new Error("The Fabric image implementation was not bound")
  }),
  fabricCapabilityCoordinate(IMAGE_GENERATE_CAPABILITY),
  resolveFabricImageMetadata,
)

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
  ...(portableImageGeneration ? { portableImageGeneration } : {}),
})

async function resolveFabricImageMetadata(
  _input: unknown,
  context: ToolContext,
): Promise<FabricDispatchMetadataV1> {
  if (!eveFabricHost) throw new Error("Gonk Fabric is not configured")
  const principal = context.auth?.principal
  const fabric = (context.host as EveFabricToolHostContext | undefined)?.fabric
  if (!principal || !fabric) {
    throw new Error(
      "Fabric image generation requires an authenticated Eve run execution",
    )
  }
  const authorization = await context.auth!.authorize({
    action: "tool.invoke",
    resource: {
      kind: "tool",
      target: IMAGE_GENERATE_CAPABILITY.capabilityId,
    },
  })
  if (authorization.outcome !== "allow") {
    throw new Error("Fabric image generation authorization was denied")
  }
  const now = Date.now()
  const expiresAt = now + 5 * 60_000
  const authorizationReceiptRef = [
    "gonk-authz",
    authorization.policyId,
    fabricExecutionBindingDigest({
      principalId: principal.id,
      capabilityId: IMAGE_GENERATE_CAPABILITY.capabilityId,
      runExecutionId: fabric.executionContext.runExecutionId,
    }),
  ].join(":")
  return {
    installationId: eveFabricHost.installationId,
    principalId: principal.id,
    audienceWorkerId: eveFabricHost.workerId,
    authorizationReceiptRef,
    executionPolicy: {
      policyRef: "sigil-chat:image-generation:v1",
      restrictionPolicyRefs: [...fabric.restrictionPolicyRefs],
      retrySafety: "safe",
      continuity: { mode: "stateless" },
      model: {
        provider: process.env.GONK_FABRIC_IMAGE_PROVIDER ?? "comfyui",
        modelId: process.env.GONK_FABRIC_IMAGE_MODEL_ID ?? "local/chroma",
        allowedFallbacks: [],
      },
    },
    executionContext: structuredClone(fabric.executionContext),
    observedTurnId: fabric.observedTurnId,
    scopeContextDigest: fabricExecutionBindingDigest({
      principalId: principal.id,
      scopes: principal.scopes,
      executionBindingDigest:
        fabric.executionContext.executionBindingDigest,
    }),
    artifactAccess: [{
      accessRef: [
        "fabric-artifact-write",
        fabric.executionContext.runExecutionId,
        "image",
      ].join(":"),
      outputSlot: "image",
      operation: "write",
      maxBytes: 25 * 1024 * 1024,
      expiresAt: new Date(expiresAt).toISOString(),
    }],
    limits: {
      notBefore: new Date(now - 5_000).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      maxRuntimeMs: 4 * 60_000,
      maxProgressEvents: 240,
      maxOutputEvents: 8,
      maxInlineOutputBytes: 64 * 1024,
      maxArtifactBytes: 25 * 1024 * 1024,
    },
  }
}

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
