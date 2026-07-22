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
import { personalScopeId } from "../../agent/agent/lib/personal-scope.js"

export interface SessionScopeOwnerLookup {
  owns(sessionId: string, principalId: string): boolean
  homeScopeId(sessionId: string, principalId: string): string | undefined
  listOwned?(principalId: string): readonly {
    id: string
    title: string
  }[]
}

export interface SessionExecutionBindingLookup {
  getBinding(sessionId: string): Promise<
    | {
        homeScopeId: string
        subject: string
      }
    | undefined
  >
}

export type DelegatedAgentReach = "principal" | "scope"

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
        const homeScopeId = sessionOwners?.homeScopeId(
          session.id,
          input.principalId,
        )
        if (!homeScopeId) return false
        if (homeScopeId === personalScopeId(input.principalId)) return true
        return authorizeContainerHome(containers, input, homeScopeId)
      }
      return authorizeContainerScope(containers, input)
    },
  }
}

function authorizeContainerHome(
  containers: Pick<ContainerRegistries, "projects" | "workspaces"> & {
    grants?: Pick<ScopeGrantRegistry, "listActive">
  },
  input: ScopeAuthorizationRequest,
  homeScopeId: string,
): boolean {
  const tier = containers.workspaces.get(homeScopeId)
    ? "workspace"
    : containers.projects.get(homeScopeId)
      ? "project"
      : undefined
  return tier
    ? authorizeContainerScope(containers, {
        ...input,
        resourceScope: `${tier}:${homeScopeId}`,
      })
    : false
}

function authorizeContainerScope(
  containers: Pick<ContainerRegistries, "projects" | "workspaces"> & {
    grants?: Pick<ScopeGrantRegistry, "listActive">
  },
  input: ScopeAuthorizationRequest,
): boolean {
  const parsed = parseContainerScope(input.resourceScope)
  if (!parsed) return false
  if (parsed.tier === "project") {
    const project = containers.projects.get(parsed.id)
    if (!project) return false
    if (hasScopeGrant(containers.grants?.listActive() ?? [], input)) return true
    return project.members.some(
      (member) => member.principalId === input.principalId,
    )
  }
  const workspace = containers.workspaces.get(parsed.id)
  if (!workspace) return false
  if (hasScopeGrant(containers.grants?.listActive() ?? [], input)) return true
  return Boolean(
    containers.projects
      .get(workspace.homeScopeId ?? workspace.projectId)
      ?.members.some((member) => member.principalId === input.principalId),
  )
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
}): Promise<
  | {
      actorSessionId?: string
      principalId: string
      scope: ResourceScope
    }
  | undefined
> {
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
  return {
    ...(delegation.actorSessionId
      ? { actorSessionId: delegation.actorSessionId }
      : {}),
    principalId: delegation.subject,
    scope: input.scope,
  }
}

/**
 * A delegated turn receives principal-wide candidate reach only when its
 * actor session is durably bound to that principal's personal scope. The
 * active scope proof still authenticates the hop; this lookup classifies the
 * already-bound agent and never grants access to any target resource.
 */
export async function resolveDelegatedAgentReach(input: {
  actorSessionId?: string
  bindings: SessionExecutionBindingLookup
  principalId: string
}): Promise<DelegatedAgentReach> {
  if (!input.actorSessionId) return "scope"
  const binding = await input.bindings.getBinding(input.actorSessionId)
  return binding?.subject === input.principalId &&
    binding.homeScopeId === personalScopeId(input.principalId)
    ? "principal"
    : "scope"
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
