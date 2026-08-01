import type { ScopeAuthorizationPolicy } from "@workspace/agent-contracts/scope-authorization"
import type { BoundAgentModel } from "@workspace/agent-contracts/model-binding"

import type { PersonalScopeRegistry } from "../../../agent/agent/lib/personal-scope"
import type { ProjectWorkspaceRegistries } from "../../../agent/agent/lib/project-workspace-registries"
import { createScopeGrantPolicy } from "../../../agent/agent/lib/scope-authorization"
import type { ScopeRecord } from "../../../agent/agent/lib/scope-registry"
import type {
  AgentThread,
  AgentThreadExecutionBinding,
  AgentThreadRepository,
  ForkAgentThreadInput,
  ScopePerspective,
} from "./agent-threads-domain"
import type { ProjectWorkspaceNav } from "./agent-thread-containers.server"

export interface ThreadBindingRegistries {
  projects: ProjectWorkspaceRegistries["projects"]
  workspaces: ProjectWorkspaceRegistries["workspaces"]
  personalScopes: Pick<
    PersonalScopeRegistry,
    "ensureForPrincipal" | "get" | "getForPrincipal"
  >
  scopes: Pick<ProjectWorkspaceRegistries["scopes"], "get">
  grants: ProjectWorkspaceRegistries["grants"]
}

export interface ThreadBindingRepository extends Pick<
  AgentThreadRepository,
  | "bindExecution"
  | "create"
  | "fork"
  | "get"
  | "getActivePreference"
  | "getDefaultPersonaId"
  | "list"
  | "resolveByRouteParam"
> {}

export interface ThreadBindingDependencies {
  repository: ThreadBindingRepository
  registries: ThreadBindingRegistries
  loadNav(principalId: string): ProjectWorkspaceNav
  resolvePerspective(
    requested: ScopePerspective,
    nav: ProjectWorkspaceNav,
  ): { perspective: ScopePerspective } | undefined
  policy?: ScopeAuthorizationPolicy
  /**
   * Resolve a requested model preset id into the snapshot to bind, or
   * undefined when the id may not be selected.
   *
   * Deliberately ONE function for every refusal reason — unknown id,
   * owner-disabled, and not-yet-enabled all return undefined and therefore
   * take the identical rejection path. That is what stops a disabled model
   * from being reachable by hand-crafting a create request: there is no
   * branch where a rejected id resolves anyway.
   */
  resolveModelPreset?(presetId: string): BoundAgentModel | undefined
}

export interface ThreadBindingCreationInput {
  personaId: string
  title?: string
  workspaceId?: string
  sessionKind?: "workspace" | "personal"
  initialPerspective?: ScopePerspective
  additionalContextScopeIds?: string[]
  /**
   * Optional fixture preset id. An ID ONLY — the browser never supplies a
   * base URL, provider, or credential reference; the server looks up what that
   * id resolves to. Absent means the deployment default, which is the
   * pre-existing behavior for every caller that does not opt in.
   */
  modelPresetId?: string
}

export interface ResolvedThreadBinding {
  workspaceId?: string
  executionBinding: AgentThreadExecutionBinding
}

export function createThreadBindingService(
  dependencies: ThreadBindingDependencies,
) {
  const policy =
    dependencies.policy ??
    createScopeGrantPolicy({ registries: dependencies.registries })

  function assertAuthorizedScope(
    principalId: string,
    scopeId: string,
  ): ScopeRecord {
    const scope = dependencies.registries.scopes.get(scopeId)
    if (!scope || scope.status !== "active") {
      throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
    }
    if (scope.kind === "personal") {
      const personal = dependencies.registries.personalScopes.get(scopeId)
      if (!personal || personal.principalId !== principalId) {
        throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
      }
      return scope
    }
    if (scope.kind !== "project" && scope.kind !== "workspace") {
      throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
    }
    if (
      !policy.authorize({
        action: "read",
        principalId,
        resourceScope: `${scope.kind}:${scope.id}`,
      })
    ) {
      throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
    }
    return scope
  }

  function canReadScope(principalId: string, scopeId: string): boolean {
    try {
      assertAuthorizedScope(principalId, scopeId)
      return true
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "EVE_RESOURCE_SCOPE_NOT_AUTHORIZED"
      ) {
        throw error
      }
      return false
    }
  }

  function resolvePerspective(
    principalId: string,
    requested: ScopePerspective,
    personalScopeId?: string,
  ): ScopePerspective {
    assertAuthorizedScope(principalId, requested.focusScopeId)
    if (
      requested.focusScopeId === personalScopeId &&
      requested.viaScopeIds.length === 0
    ) {
      return { focusScopeId: personalScopeId, viaScopeIds: [] }
    }
    // A direct exact grant authorizes opening the scope even when its
    // canonical/display path is intentionally undiscoverable. Non-empty via
    // paths still go through the visibility-filtered nav resolver below.
    if (requested.viaScopeIds.length === 0) {
      return { focusScopeId: requested.focusScopeId, viaScopeIds: [] }
    }
    const resolved = dependencies.resolvePerspective(
      requested,
      dependencies.loadNav(principalId),
    )?.perspective
    if (!resolved) {
      throw new Error("Agent thread initial perspective is not available.")
    }
    return resolved
  }

  function resolveContextScopes(
    principalId: string,
    scopeIds: readonly string[],
  ): string[] {
    const seen = new Set<string>()
    const authorized: string[] = []
    for (const scopeId of scopeIds) {
      const normalized = scopeId.trim()
      if (!normalized || seen.has(normalized)) continue
      assertAuthorizedScope(principalId, normalized)
      seen.add(normalized)
      authorized.push(normalized)
    }
    return authorized
  }

  /**
   * Validate a requested model preset id server-side.
   *
   * Throws rather than silently falling back: a user who picked luna and
   * quietly got the default would have no way to tell, and MDL.2's whole
   * point is that the choice is honest.
   */
  function resolveBoundModel(
    input: ThreadBindingCreationInput,
  ): BoundAgentModel | undefined {
    const presetId = input.modelPresetId?.trim()
    if (!presetId) return undefined
    const resolved = dependencies.resolveModelPreset?.(presetId)
    if (!resolved) throw new Error("EVE_MODEL_PRESET_NOT_SELECTABLE")
    return resolved
  }

  function resolveCreation(
    principalId: string,
    input: ThreadBindingCreationInput,
  ): ResolvedThreadBinding {
    const preference = dependencies.repository.getActivePreference(principalId)
    const explicitWorkspace = input.workspaceId?.trim()
    const activeFocus = preference.activePerspective?.focusScopeId.trim()
    const activeWorkspace = activeFocus
      ? dependencies.registries.workspaces.get(activeFocus)?.id
      : undefined
    const requiresWorkspace =
      input.sessionKind === "workspace" || explicitWorkspace !== undefined
    const workspaceId = explicitWorkspace ?? activeWorkspace
    const useWorkspace =
      input.sessionKind !== "personal" &&
      workspaceId !== undefined &&
      (requiresWorkspace || canReadScope(principalId, workspaceId))

    if (useWorkspace) {
      assertAuthorizedScope(principalId, workspaceId)
      const preferredPerspective =
        input.initialPerspective ??
        (preference.activePerspective?.focusScopeId === workspaceId
          ? preference.activePerspective
          : { focusScopeId: workspaceId, viaScopeIds: [] })
      const initialPerspective = resolvePerspective(
        principalId,
        preferredPerspective,
      )
      if (initialPerspective.focusScopeId !== workspaceId) {
        throw new Error("Agent thread initial perspective is not valid.")
      }
      const boundModel = resolveBoundModel(input)
      return {
        workspaceId,
        executionBinding: {
          principalId,
          personaId: input.personaId,
          homeScopeId: workspaceId,
          initialPerspective,
          additionalContextScopeIds: resolveContextScopes(
            principalId,
            input.additionalContextScopeIds ?? [],
          ),
          ...(boundModel ? { model: boundModel } : {}),
        },
      }
    }

    if (requiresWorkspace) {
      throw new Error(
        "Workspace-homed agent thread requires an authorized workspace.",
      )
    }
    const personalScope =
      dependencies.registries.personalScopes.ensureForPrincipal(principalId)
    const requestedPerspective = input.initialPerspective ?? {
      focusScopeId: personalScope.id,
      viaScopeIds: [],
    }
    const personalBoundModel = resolveBoundModel(input)
    return {
      executionBinding: {
        principalId,
        personaId: input.personaId,
        homeScopeId: personalScope.id,
        initialPerspective: resolvePerspective(
          principalId,
          requestedPerspective,
          personalScope.id,
        ),
        additionalContextScopeIds: resolveContextScopes(
          principalId,
          input.additionalContextScopeIds ?? [],
        ),
        ...(personalBoundModel ? { model: personalBoundModel } : {}),
      },
    }
  }

  function assertBindingAuthorized(
    principalId: string,
    personaId: string,
    binding: AgentThreadExecutionBinding,
  ): void {
    if (
      binding.principalId !== principalId ||
      binding.personaId !== personaId
    ) {
      throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
    }
    assertAuthorizedScope(principalId, binding.homeScopeId)
    assertAuthorizedScope(principalId, binding.initialPerspective.focusScopeId)
    resolveContextScopes(principalId, binding.additionalContextScopeIds)
  }

  function bindLegacyThread(
    principalId: string,
    thread: AgentThread,
    expectedRevision?: number,
  ): AgentThread {
    if (thread.executionBinding) {
      assertBindingAuthorized(
        principalId,
        thread.personaId,
        thread.executionBinding,
      )
      return thread
    }
    const workspaceId = thread.workspaceId?.trim() || undefined
    // A revoked legacy workspace session remains workspace content. Refuse to
    // migrate it rather than silently rehoming its transcript as personal.
    if (workspaceId) assertAuthorizedScope(principalId, workspaceId)
    const resolved = resolveCreation(principalId, {
      personaId: thread.personaId,
      ...(workspaceId ? { workspaceId } : {}),
    })
    return dependencies.repository.bindExecution(
      principalId,
      thread.id,
      resolved.executionBinding,
      expectedRevision,
    )
  }

  function createThread(
    principalId: string,
    input: ThreadBindingCreationInput,
  ): AgentThread {
    const resolved = resolveCreation(principalId, input)
    return dependencies.repository.create(principalId, {
      personaId: input.personaId,
      title: input.title,
      ...(resolved.workspaceId ? { workspaceId: resolved.workspaceId } : {}),
      executionBinding: resolved.executionBinding,
    })
  }

  return {
    resolveCreation,
    create: createThread,

    ensureActive(principalId: string): AgentThread[] {
      const active = dependencies.repository.list(principalId, false)
      if (active.length === 0) {
        return [
          createThread(principalId, {
            personaId: dependencies.repository.getDefaultPersonaId(),
          }),
        ]
      }
      return active.map((thread) => bindLegacyThread(principalId, thread))
    },

    // SC.10 session slugs — `threadId` here is a route param that may be
    // either the canonical UUID id (an old link) or the short slug (the
    // common case now); resolveByRouteParam picks the right lookup
    // unambiguously (see isUuidShaped). The returned thread's own `.id`/
    // `.slug` are always the canonical pair regardless of which form was
    // requested — callers needing to canonicalize the URL compare against
    // `.slug`, not against the raw `threadId` they passed in.
    resolveExecution(principalId: string, threadId: string): AgentThread {
      const thread = dependencies.repository.resolveByRouteParam(
        principalId,
        threadId,
      )
      if (!thread) throw new Error(`Agent thread ${threadId} was not found.`)
      return bindLegacyThread(principalId, thread)
    },

    fork(principalId: string, input: ForkAgentThreadInput): AgentThread {
      const source = dependencies.repository.get(
        principalId,
        input.sourceThreadId,
      )
      if (!source) {
        throw new Error(`Agent thread ${input.sourceThreadId} was not found.`)
      }
      const bound = bindLegacyThread(
        principalId,
        source,
        source.executionBinding ? undefined : input.expectedRevision,
      )
      return dependencies.repository.fork(principalId, {
        ...input,
        expectedRevision: source.executionBinding
          ? input.expectedRevision
          : bound.revision,
      })
    },
  }
}
