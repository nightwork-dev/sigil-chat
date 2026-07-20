import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import { verifyScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"

import { getProjectWorkspaceRegistries } from "./project-workspace-registries"
import type { ProjectRegistry } from "./project-registry"
import type { WorkspaceRegistry } from "./workspace-registry"

export interface ScopeAuthorizationRegistries {
  projects: Pick<ProjectRegistry, "get">
  workspaces: Pick<WorkspaceRegistry, "get">
}

export function requireAuthorizedResourceScope(input: {
  principalId: string
  request: Request
  secret: string | undefined
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
  assertRegisteredScopeMembership(
    scope,
    input.principalId,
    input.registries ?? getProjectWorkspaceRegistries(),
  )
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
  const project = registries.projects.get(workspace.projectId)
  if (
    !project ||
    !project.members.some((member) => member.principalId === principalId)
  ) {
    throw new Error("EVE_RESOURCE_SCOPE_NOT_AUTHORIZED")
  }
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
