import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import {
  hasScopeGrant,
  type ScopeAuthorizationAction,
  type ScopeAuthorizationPolicy,
  type ScopeAuthorizationRequest,
  type ScopeGrant,
} from "@workspace/agent-contracts/scope-authorization"
import { verifyScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"

import { getProjectWorkspaceRegistries } from "./project-workspace-registries"
import type { ProjectRegistry } from "./project-registry"
import type { WorkspaceRegistry } from "./workspace-registry"
import type { ScopeGrantRegistry } from "./scope-grant-registry"

export interface ScopeAuthorizationRegistries {
  projects: Pick<ProjectRegistry, "get">
  workspaces: Pick<WorkspaceRegistry, "get">
  grants?: Pick<ScopeGrantRegistry, "listActive">
}

export interface ScopeGrantPolicyOptions {
  /** Read on every authorization attempt; never cache revocable grants. */
  grants?: () => readonly ScopeGrant[]
  registries?: ScopeAuthorizationRegistries
}

/**
 * This adapter reads the canonical-home compatibility field at the registry
 * boundary. Future resource families can provide their own home resolver
 * without changing signed delegation or Gonk principal transport.
 */
export function createScopeGrantPolicy(
  options: ScopeGrantPolicyOptions = {},
): ScopeAuthorizationPolicy {
  const registries = options.registries ?? getProjectWorkspaceRegistries()
  const grants = options.grants ?? (() => registries.grants?.listActive() ?? [])
  return {
    authorize(input): boolean {
      const request: ScopeAuthorizationRequest = {
        ...input,
        canonicalHomeScope: canonicalHomeScope(input.resourceScope, registries),
      }
      if (hasScopeGrant(grants(), request)) return true
      return hasRegisteredScopeMembership(
        request.resourceScope,
        request.principalId,
        registries,
      )
    },
  }
}

export function requireAuthorizedResourceScope(input: {
  action?: ScopeAuthorizationAction
  principalId: string
  request: Request
  secret: string | undefined
  policy?: ScopeAuthorizationPolicy
  registries?: ScopeAuthorizationRegistries
}): string | undefined {
  const scope = input.request.headers.get("x-sigil-scope")?.trim()
  if (!scope) return undefined
  const proof = input.request.headers.get(AGENT_SCOPE_PROOF_HEADER)?.trim()
  const secret = input.secret?.trim()
  if (
    !proof ||
    !secret ||
    !verifyScopeDelegation(
      proof,
      {
        now: Math.floor(Date.now() / 1_000),
        scope,
        subject: input.principalId,
      },
      secret,
    )
  ) {
    throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
  }
  // Non-container legacy scopes are possession-gated by their signed proof;
  // do not open the registry just to validate a session scope.
  if (!parseContainerScope(scope) && !input.policy) return scope
  const registries = input.registries ?? getProjectWorkspaceRegistries()
  const policy =
    input.policy ?? createScopeGrantPolicy({ registries })
  if (
    !policy.authorize({
      action: input.action ?? "tool",
      principalId: input.principalId,
      resourceScope: scope,
    })
  ) {
    throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
  }
  return scope
}

/**
 * A registry record tightens the legacy proof check to actual membership. The
 * absence of a record remains compatible with scopes minted before registries.
 */
export function assertRegisteredScopeMembership(
  scope: string,
  principalId: string,
  registries: ScopeAuthorizationRegistries,
): void {
  const parsed = parseContainerScope(scope)
  if (!parsed) return

  if (parsed.tier === "project") {
    const project = registries.projects.get(parsed.id)
    if (!project) {
      // Legacy unregistered scope ids stay possession-gated until migration.
      return
    }
    if (!project.members.some((member) => member.principalId === principalId)) {
      throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
    }
    return
  }

  const workspace = registries.workspaces.get(parsed.id)
  if (!workspace) {
    // Legacy unregistered scope ids stay possession-gated until migration.
    return
  }
  const project = registries.projects.get(
    workspace.homeScopeId ?? workspace.projectId,
  )
  if (
    !project ||
    !project.members.some((member) => member.principalId === principalId)
  ) {
    throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
  }
}

function hasRegisteredScopeMembership(
  scope: string,
  principalId: string,
  registries: ScopeAuthorizationRegistries,
): boolean {
  try {
    assertRegisteredScopeMembership(scope, principalId, registries)
    return true
  } catch {
    return false
  }
}

function canonicalHomeScope(
  scope: string,
  registries: ScopeAuthorizationRegistries,
): string | undefined {
  const parsed = parseContainerScope(scope)
  if (!parsed) return undefined
  if (parsed.tier === "project") return scope
  const workspace = registries.workspaces.get(parsed.id)
  return workspace
    ? `project:${workspace.homeScopeId ?? workspace.projectId}`
    : undefined
}

function parseContainerScope(
  scope: string,
): { tier: "project" | "workspace"; id: string } | undefined {
  const separator = scope.indexOf(":")
  if (separator < 1 || separator === scope.length - 1) return undefined
  const tier = scope.slice(0, separator)
  if (tier !== "project" && tier !== "workspace") return undefined
  return { tier, id: scope.slice(separator + 1) }
}
