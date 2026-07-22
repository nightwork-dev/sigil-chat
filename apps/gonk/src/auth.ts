import type { AgentMcpAuthorizationPolicy } from "@zigil/agent-gonk"
import { createSignedDelegationProvider } from "@gonk/eve-host/guard"
import {
  hasScopeGrant,
  type ScopeAuthorizationPolicy,
  type ScopeAuthorizationRequest,
} from "@workspace/agent-contracts/scope-authorization"
import {
  SIGIL_GONK_DELEGATION_AUDIENCE,
  SIGIL_GONK_DELEGATION_ISSUER,
  SIGIL_GONK_DELEGATION_TTL_MS,
} from "@workspace/agent-contracts/gonk-turn-delegation"
import { readScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"

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
        applicationThreadId: string
        homeScopeId: string
        personaId: string
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
 * Authenticate the web-owned external MCP gateway. This path deliberately has
 * no Eve session: the gateway authenticates its own API credential, then signs
 * the already-authorized user and resource scope for the Gonk hop. The shared
 * bearer alone is insufficient, and live authorization is still re-read here.
 */
export function authenticateExternalScopeDelegation(input: {
  now?: number
  policy: ScopeAuthorizationPolicy
  proof: string | undefined
  scope: ResourceScope | undefined
  secret: string
}): {
  actorSessionId?: undefined
  principalId: string
  scope: ResourceScope
} | undefined {
  if (!input.scope || !input.proof) return undefined
  const delegation = readScopeDelegation(
    input.proof,
    input.now ?? Math.floor(Date.now() / 1_000),
    input.secret,
  )
  const scope = formatScopeHeader(input.scope)
  if (
    !delegation ||
    !scope ||
    delegation.actorSessionId !== undefined ||
    delegation.scope !== scope ||
    !input.policy.authorize({
      action: "tool",
      principalId: delegation.subject,
      resourceScope: scope,
    })
  ) return undefined
  return { principalId: delegation.subject, scope: input.scope }
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
 * Convert Eve's turn-bound bearer into the Gonk principal. The bearer proves
 * which authenticated Eve turn is calling; the durable binding proves that
 * turn still belongs to the same application thread, persona, and user. Live
 * authorization is deliberately re-read on every MCP request, so neither an
 * unexpired bearer nor a warm MCP session can outlive a revoked grant.
 */
export async function authenticateEveTurnDelegation(input: {
  bindings: SessionExecutionBindingLookup
  now?: number
  policy: ScopeAuthorizationPolicy
  scope: ResourceScope | undefined
  secret: string
  token: string | undefined
}): Promise<
  | {
      actorSessionId: string
      channelId: string
      correlationId: string
      delegationId: string
      personaId: string
      principalId: string
      scope: ResourceScope
    }
  | undefined
> {
  if (!input.scope || !input.token) return undefined
  const provider = createSignedDelegationProvider({
    issuer: SIGIL_GONK_DELEGATION_ISSUER,
    audience: SIGIL_GONK_DELEGATION_AUDIENCE,
    secret: input.secret,
    authorize: () => ({
      outcome: "deny",
      reason: "Gonk applies its application authorization policy separately.",
    }),
    maxTtlMs: SIGIL_GONK_DELEGATION_TTL_MS,
  })
  let delegation
  try {
    delegation = provider.verify(input.token, input.now ?? Date.now())
  } catch {
    return undefined
  }
  const scope = formatScopeHeader(input.scope)
  const binding = await input.bindings.getBinding(delegation.eveSessionId)
  if (
    !scope ||
    delegation.activeResourceScope !== scope ||
    !binding ||
    binding.subject !== delegation.subject ||
    binding.applicationThreadId !== delegation.channelId ||
    binding.personaId !== delegation.personaId ||
    !input.policy.authorize({
      action: "tool",
      principalId: delegation.subject,
      resourceScope: scope,
    })
  ) return undefined
  return {
    actorSessionId: delegation.eveSessionId,
    channelId: delegation.channelId,
    correlationId: delegation.correlationId,
    delegationId: delegation.delegationId,
    personaId: delegation.personaId,
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
