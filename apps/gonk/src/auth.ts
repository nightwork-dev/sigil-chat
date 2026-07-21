import type { AgentMcpAuthorizationPolicy } from "@zigil/agent-gonk"
import {
  hasScopeGrant,
  type ScopeAuthorizationPolicy,
  type ScopeAuthorizationRequest,
} from "@workspace/agent-contracts/scope-authorization"
import {
  readScopeDelegation,
} from "@workspace/agent-contracts/scope-delegation.server"

import {
  formatScopeHeader,
  type ResourceScope,
} from "./artifact-scope.js"
import type { ContainerRegistries } from "./registry/containers.js"
import type { ScopeGrantRegistry } from "../../agent/agent/lib/scope-grant-registry.js"

export interface SessionScopeOwnerLookup {
  owns(sessionId: string, principalId: string): boolean
}

export const authorizeSigilMcpRequest: AgentMcpAuthorizationPolicy = () => {
  // Sigil currently exposes one trusted service principal: possession of
  // the bearer permits application-tool authorization, while operation
  // risk and user consent remain the registry ApprovalProvider's job.
  return {
    outcome: "allow",
    reason: "Authenticated Sigil MCP principals may access application tools",
  }
}

/**
 * Registry adapter for canonical homes plus durable exact-resource grants.
 * Membership is evaluated at the canonical home; a direct grant is evaluated
 * against the target identity and never against a mount or perspective.
 */
export function createContainerScopeAuthorizationPolicy(
  containers: Pick<
    ContainerRegistries,
    "projects" | "workspaces"
  > & { grants?: Pick<ScopeGrantRegistry, "listActive"> },
  sessionOwners?: SessionScopeOwnerLookup,
): ScopeAuthorizationPolicy {
  return {
    authorize(input: ScopeAuthorizationRequest): boolean {
      const session = parseSessionScope(input.resourceScope)
      if (session) {
        return sessionOwners?.owns(session.id, input.principalId) === true
      }
      if (hasScopeGrant(containers.grants?.listActive() ?? [], input)) {
        return true
      }
      const parsed = parseContainerScope(input.resourceScope)
      if (!parsed) return false
      if (parsed.tier === "project") {
        return Boolean(
          containers.projects
            .get(parsed.id)
            ?.members.some((member) => member.principalId === input.principalId),
        )
      }
      const workspace = containers.workspaces.get(parsed.id)
      return Boolean(
        workspace &&
          containers.projects
            .get(workspace.homeScopeId ?? workspace.projectId)
            ?.members.some((member) => member.principalId === input.principalId),
      )
    },
  }
}

/**
 * Convert Eve's signed, user-bound delegation into the Gonk principal. This
 * both proves the identity survived the host hop and re-reads authorization on
 * every MCP request, so an unexpired proof cannot outlive a revoked grant.
 */
export async function authenticateScopeDelegation(input: {
  now?: number
  policy: ScopeAuthorizationPolicy
  proof: string | undefined
  scope: ResourceScope | undefined
  secret: string
}): Promise<{ principalId: string; scope: ResourceScope } | undefined> {
  if (!input.scope || !input.proof) return undefined
  const delegation = readScopeDelegation(
    input.proof,
    input.now ?? Math.floor(Date.now() / 1_000),
    input.secret,
  )
  if (
    !delegation ||
    delegation.scope !== formatScopeHeader(input.scope) ||
    !input.policy.authorize({
      action: "tool",
      principalId: delegation.subject,
      resourceScope: delegation.scope,
    })
  ) {
    return undefined
  }
  return { principalId: delegation.subject, scope: input.scope }
}

function parseSessionScope(scope: string): { id: string } | undefined {
  const prefix = "session:"
  if (!scope.startsWith(prefix) || scope.length === prefix.length) return undefined
  return { id: scope.slice(prefix.length) }
}

function parseContainerScope(
  scope: string,
): { id: string; tier: "project" | "workspace" } | undefined {
  const separator = scope.indexOf(":")
  if (separator < 1 || separator === scope.length - 1) return undefined
  const tier = scope.slice(0, separator)
  if (tier !== "project" && tier !== "workspace") return undefined
  return { id: scope.slice(separator + 1), tier }
}
