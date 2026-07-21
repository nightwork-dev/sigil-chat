import type { ScopeAuthorizationPolicy } from "@workspace/agent-contracts/scope-authorization";

import type { PersonalScopeRegistry } from "../../../agent/agent/lib/personal-scope";
import type { ProjectWorkspaceRegistries } from "../../../agent/agent/lib/project-workspace-registries";
import { createScopeGrantPolicy } from "../../../agent/agent/lib/scope-authorization";
import type { ScopeRecord } from "../../../agent/agent/lib/scope-registry";
import type {
  AgentThread,
  AgentThreadExecutionBinding,
  AgentThreadRepository,
  ForkAgentThreadInput,
  ScopePerspective,
} from "./agent-threads-domain";
import type { ProjectWorkspaceNav } from "./agent-thread-containers.server";

export interface ThreadBindingRegistries {
  projects: ProjectWorkspaceRegistries["projects"];
  workspaces: ProjectWorkspaceRegistries["workspaces"];
  personalScopes: Pick<
    PersonalScopeRegistry,
    "ensureForPrincipal" | "get" | "getForPrincipal"
  >;
  scopes: Pick<ProjectWorkspaceRegistries["scopes"], "get">;
  grants: ProjectWorkspaceRegistries["grants"];
}

export interface ThreadBindingRepository
  extends Pick<
    AgentThreadRepository,
    | "bindExecution"
    | "create"
    | "fork"
    | "get"
    | "getActivePreference"
    | "getDefaultPersonaId"
    | "list"
  > {}

export interface ThreadBindingDependencies {
  repository: ThreadBindingRepository;
  registries: ThreadBindingRegistries;
  loadNav(principalId: string): ProjectWorkspaceNav;
  resolvePerspective(
    requested: ScopePerspective,
    nav: ProjectWorkspaceNav,
  ): { perspective: ScopePerspective } | undefined;
  policy?: ScopeAuthorizationPolicy;
}

export interface ThreadBindingCreationInput {
  personaId: string;
  title?: string;
  workspaceId?: string;
  sessionKind?: "workspace" | "personal";
  initialPerspective?: ScopePerspective;
  additionalContextScopeIds?: string[];
}

export interface ResolvedThreadBinding {
  workspaceId?: string;
  executionBinding: AgentThreadExecutionBinding;
}

export function createThreadBindingService(dependencies: ThreadBindingDependencies) {
  const policy =
    dependencies.policy ??
    createScopeGrantPolicy({ registries: dependencies.registries });

  function assertAuthorizedScope(
    principalId: string,
    scopeId: string,
  ): ScopeRecord {
    const scope = dependencies.registries.scopes.get(scopeId);
    if (!scope || scope.status !== "active") {
      throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED");
    }
    if (scope.kind === "personal") {
      const personal = dependencies.registries.personalScopes.get(scopeId);
      if (!personal || personal.principalId !== principalId) {
        throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED");
      }
      return scope;
    }
    if (scope.kind !== "project" && scope.kind !== "workspace") {
      throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED");
    }
    if (
      !policy.authorize({
        action: "read",
        principalId,
        resourceScope: `${scope.kind}:${scope.id}`,
      })
    ) {
      throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED");
    }
    return scope;
  }

  function canReadScope(principalId: string, scopeId: string): boolean {
    try {
      assertAuthorizedScope(principalId, scopeId);
      return true;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "EVE_RESOURCE_SCOPE_NOT_AUTHORIZED"
      ) {
        throw error;
      }
      return false;
    }
  }

  function resolvePerspective(
    principalId: string,
    requested: ScopePerspective,
    personalScopeId?: string,
  ): ScopePerspective {
    assertAuthorizedScope(principalId, requested.focusScopeId);
    if (
      requested.focusScopeId === personalScopeId &&
      requested.viaScopeIds.length === 0
    ) {
      return { focusScopeId: personalScopeId, viaScopeIds: [] };
    }
    // A direct exact grant authorizes opening the scope even when its
    // canonical/display path is intentionally undiscoverable. Non-empty via
    // paths still go through the visibility-filtered nav resolver below.
    if (requested.viaScopeIds.length === 0) {
      return { focusScopeId: requested.focusScopeId, viaScopeIds: [] };
    }
    const resolved = dependencies.resolvePerspective(
      requested,
      dependencies.loadNav(principalId),
    )?.perspective;
    if (!resolved) {
      throw new Error("Agent thread initial perspective is not available.");
    }
    return resolved;
  }

  function resolveContextScopes(
    principalId: string,
    scopeIds: readonly string[],
  ): string[] {
    const seen = new Set<string>();
    const authorized: string[] = [];
    for (const scopeId of scopeIds) {
      const normalized = scopeId.trim();
      if (!normalized || seen.has(normalized)) continue;
      assertAuthorizedScope(principalId, normalized);
      seen.add(normalized);
      authorized.push(normalized);
    }
    return authorized;
  }

  function resolveCreation(
    principalId: string,
    input: ThreadBindingCreationInput,
  ): ResolvedThreadBinding {
    const preference = dependencies.repository.getActivePreference(principalId);
    const explicitWorkspace = input.workspaceId?.trim();
    const activeWorkspace = preference.activeWorkspaceId?.trim();
    const requiresWorkspace =
      input.sessionKind === "workspace" || explicitWorkspace !== undefined;
    const workspaceId = explicitWorkspace ?? activeWorkspace;
    const useWorkspace =
      input.sessionKind !== "personal" &&
      workspaceId !== undefined &&
      (requiresWorkspace || canReadScope(principalId, workspaceId));

    if (useWorkspace) {
      assertAuthorizedScope(principalId, workspaceId);
      const preferredPerspective =
        input.initialPerspective ??
        (preference.activePerspective?.focusScopeId === workspaceId
          ? preference.activePerspective
          : { focusScopeId: workspaceId, viaScopeIds: [] });
      const initialPerspective = resolvePerspective(
        principalId,
        preferredPerspective,
      );
      if (initialPerspective.focusScopeId !== workspaceId) {
        throw new Error("Agent thread initial perspective is not valid.");
      }
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
        },
      };
    }

    if (requiresWorkspace) {
      throw new Error("Workspace-homed agent thread requires an authorized workspace.");
    }
    const personalScope =
      dependencies.registries.personalScopes.ensureForPrincipal(principalId);
    const requestedPerspective =
      input.initialPerspective ?? {
        focusScopeId: personalScope.id,
        viaScopeIds: [],
      };
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
      },
    };
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
      throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED");
    }
    assertAuthorizedScope(principalId, binding.homeScopeId);
    assertAuthorizedScope(principalId, binding.initialPerspective.focusScopeId);
    resolveContextScopes(principalId, binding.additionalContextScopeIds);
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
      );
      return thread;
    }
    const workspaceId = thread.workspaceId?.trim() || undefined;
    // A revoked legacy workspace session remains workspace content. Refuse to
    // migrate it rather than silently rehoming its transcript as personal.
    if (workspaceId) assertAuthorizedScope(principalId, workspaceId);
    const resolved = resolveCreation(principalId, {
      personaId: thread.personaId,
      ...(workspaceId ? { workspaceId } : {}),
    });
    return dependencies.repository.bindExecution(
      principalId,
      thread.id,
      resolved.executionBinding,
      expectedRevision,
    );
  }

  function createThread(
    principalId: string,
    input: ThreadBindingCreationInput,
  ): AgentThread {
    const resolved = resolveCreation(principalId, input);
    return dependencies.repository.create(principalId, {
        personaId: input.personaId,
        title: input.title,
        ...(resolved.workspaceId ? { workspaceId: resolved.workspaceId } : {}),
        executionBinding: resolved.executionBinding,
    });
  }

  return {
    resolveCreation,
    create: createThread,

    ensureActive(principalId: string): AgentThread[] {
      const active = dependencies.repository.list(principalId, false);
      if (active.length === 0) {
        return [
          createThread(principalId, {
            personaId: dependencies.repository.getDefaultPersonaId(),
          }),
        ];
      }
      return active.map((thread) => bindLegacyThread(principalId, thread));
    },

    resolveExecution(principalId: string, threadId: string): AgentThread {
      const thread = dependencies.repository.get(principalId, threadId);
      if (!thread) throw new Error(`Agent thread ${threadId} was not found.`);
      return bindLegacyThread(principalId, thread);
    },

    fork(principalId: string, input: ForkAgentThreadInput): AgentThread {
      const source = dependencies.repository.get(principalId, input.sourceThreadId);
      if (!source) {
        throw new Error(`Agent thread ${input.sourceThreadId} was not found.`);
      }
      const bound = bindLegacyThread(
        principalId,
        source,
        source.executionBinding ? undefined : input.expectedRevision,
      );
      return dependencies.repository.fork(principalId, {
        ...input,
        expectedRevision: source.executionBinding
          ? input.expectedRevision
          : bound.revision,
      });
    },
  };
}
