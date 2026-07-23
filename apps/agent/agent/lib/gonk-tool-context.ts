import type {
  AuthContext,
  AuthenticatedPrincipal,
  AuthorizationDecision,
  AuthorizationRequest,
} from "@gonk/auth"
import type { ToolDefinition } from "@gonk/tool-registry"
import type {
  GonkToolDiscoveryRequest,
  GonkToolInvocationContextRequest,
} from "@gonk/eve-host/tools"
import type { DynamicResolveContext } from "eve/tools"

import {
  eveSessionOwnerStore,
  projectWorkspaceRegistries,
  scopeGrantPolicy,
  threadScopeOwners,
} from "./application-services"
import { personalScopeId } from "./personal-scope"
import { toolApprovalModeFor } from "./tool-approval-preference"

export async function authorizeGonkToolDiscovery(
  request: GonkToolDiscoveryRequest,
): Promise<boolean> {
  const auth = createGonkAuthContext(request.context)
  const decision = await auth.authorize({
    action: "tool.discover",
    resource: toolResource(request.tool),
  })
  return decision.outcome === "allow"
}

export async function makeGonkToolContext(
  request: GonkToolInvocationContextRequest,
) {
  const current = requireCurrentAuth(request.dynamic)
  const resourceScope = stringAttribute(current.attributes.sigilResourceScope)
  const binding = await eveSessionOwnerStore.getBinding(
    request.dynamic.session.id,
  )
  const agentReach =
    binding?.subject === current.principalId &&
    binding.homeScopeId === personalScopeId(current.principalId)
      ? "principal"
      : "scope"
  return {
    auth: createGonkAuthContext(request.dynamic),
    cwd: process.cwd(),
    env: process.env,
    host: {
      ...(resourceScope ? { resourceScope } : {}),
      agentReach,
      applicationThreadId: executionBindingAttribute(
        current.attributes.sigilExecutionBinding,
      )?.applicationThreadId,
      personaId: stringAttribute(current.attributes.sigilPersonaId),
    },
    log: silentLogger,
    signal: request.eve.abortSignal,
  }
}

export function approvalForGonkTool(input: {
  tool: ToolDefinition
  gonkApproval: { tier: string } | undefined
  dynamic: DynamicResolveContext
}): "not-applicable" | "user-approval" {
  if (input.gonkApproval?.tier === "read") return "not-applicable"
  const current = requireCurrentAuth(input.dynamic)
  return toolApprovalModeFor(
    current.attributes.sigilToolApproval,
    input.tool.name,
  ) === "always"
    ? "not-applicable"
    : "user-approval"
}

export function createGonkAuthContext(
  dynamic: DynamicResolveContext,
): AuthContext {
  const current = requireCurrentAuth(dynamic)
  const principal = principalFromDynamicAuth(current, dynamic.session.id)
  const resourceScope = stringAttribute(current.attributes.sigilResourceScope)
  const personaId = stringAttribute(current.attributes.sigilPersonaId)
  return {
    principal,
    authorize: (request) =>
      authorizeGonkRequest({
        request,
        principal,
        resourceScope,
        personaId,
      }),
  }
}

export function authorizeGonkRequest(
  input: {
    request: AuthorizationRequest
    principal: AuthenticatedPrincipal
    resourceScope: string | undefined
    personaId: string | undefined
  },
  canAccess: (
    principalId: string,
    resourceScope: string,
    personaId: string | undefined,
  ) => boolean = canAccessResourceScope,
): AuthorizationDecision {
  if (input.request.action === "application:scope.tool") {
    const target = input.request.resource.target
    return typeof target === "string" &&
      canAccess(input.principal.id, target, input.personaId)
      ? allow("The authenticated principal may use tools in this scope")
      : deny("The authenticated principal cannot use tools in this scope")
  }
  if (
    input.request.action !== "tool.discover" &&
    input.request.action !== "tool.invoke"
  ) {
    return deny("This authorization context only permits tool operations")
  }
  if (
    !input.resourceScope ||
    !canAccess(input.principal.id, input.resourceScope, input.personaId)
  ) {
    return deny("The active Sigil resource scope is no longer authorized")
  }
  if (input.request.resource.kind !== "tool") {
    return deny("Tool operations require a tool authorization resource")
  }
  const authorization = toolAuthorizationMetadata(
    input.request.resource.metadata,
  )
  if (
    authorization.requiredRole &&
    !input.principal.roles.includes(authorization.requiredRole)
  ) {
    return deny("The authenticated principal lacks the required tool role")
  }
  if (
    authorization.allowedCallers &&
    !authorization.allowedCallers.includes(input.principal.id) &&
    !authorization.allowedCallers.includes(input.principal.identity.subject)
  ) {
    return deny("The authenticated principal is not an allowed tool caller")
  }
  if (
    authorization.authLevel &&
    !input.principal.roles.includes(authorization.authLevel)
  ) {
    return deny("The authenticated principal lacks the required auth level")
  }
  return allow("The authenticated Sigil principal may use this tool")
}

function canAccessResourceScope(
  principalId: string,
  resourceScope: string,
  personaId: string | undefined,
): boolean {
  const parsed = parseScope(resourceScope)
  if (!parsed) return false
  if (parsed.tier === "project" || parsed.tier === "workspace") {
    return scopeGrantPolicy.authorize({
      action: "tool",
      principalId,
      resourceScope,
    })
  }
  if (parsed.tier === "session") {
    const homeScopeId = threadScopeOwners.homeScopeId(parsed.id, principalId)
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
        action: "tool",
        principalId,
        resourceScope: homeScope,
      }),
    )
  }
  return parsed.tier === "persona" && parsed.id === personaId
}

function principalFromDynamicAuth(
  current: ReturnType<typeof requireCurrentAuth>,
  eveSessionId: string,
): AuthenticatedPrincipal {
  const role = stringAttribute(current.attributes.sigilRole)
  const resourceScope = stringAttribute(current.attributes.sigilResourceScope)
  return {
    id: current.principalId,
    kind: "human",
    identity: {
      issuer: current.issuer ?? "sigil-chat",
      subject: current.subject ?? current.principalId,
      method: `custom:${current.authenticator}`,
    },
    delegation: {
      actorKind: "agent",
      actor: {
        issuer: "sigil-chat",
        subject: "sigil-chat-agent",
        method: "local",
      },
      actorId: "agent:sigil-chat-agent",
      actorSessionId: eveSessionId,
    },
    roles: role ? [role] : [],
    scopes: resourceScope ? [resourceScope] : [],
  }
}

function requireCurrentAuth(dynamic: DynamicResolveContext) {
  const current = dynamic.session.auth.current
  if (!current) throw new Error("GONK_EVE_AUTH_REQUIRED")
  return current
}

function toolResource(tool: ToolDefinition) {
  const metadata: Record<string, unknown> = {}
  if (tool.authorization) metadata.authorization = tool.authorization
  return {
    kind: "tool" as const,
    target: tool.name,
    ...(Object.keys(metadata).length ? { metadata } : {}),
  }
}

function toolAuthorizationMetadata(value: unknown): {
  allowedCallers?: string[]
  authLevel?: string
  requiredRole?: string
} {
  if (!isRecord(value) || !isRecord(value.authorization)) return {}
  const authorization = value.authorization
  return {
    ...(typeof authorization.requiredRole === "string"
      ? { requiredRole: authorization.requiredRole }
      : {}),
    ...(typeof authorization.authLevel === "string"
      ? { authLevel: authorization.authLevel }
      : {}),
    ...(Array.isArray(authorization.allowedCallers) &&
    authorization.allowedCallers.every((value) => typeof value === "string")
      ? { allowedCallers: authorization.allowedCallers }
      : {}),
  }
}

function parseScope(value: string) {
  const match = /^(session|workspace|project|persona):([^\s:][^\s]*)$/.exec(
    value,
  )
  return match ? { tier: match[1]!, id: match[2]! } : undefined
}

function stringAttribute(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function executionBindingAttribute(
  value: unknown,
): { applicationThreadId: string } | undefined {
  if (typeof value !== "string") return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) &&
      typeof parsed.applicationThreadId === "string" &&
      parsed.applicationThreadId.trim()
      ? { applicationThreadId: parsed.applicationThreadId.trim() }
      : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function allow(reason: string): AuthorizationDecision {
  return { outcome: "allow", policyId: "sigil-eve-native-tools-v1", reason }
}

function deny(reason: string): AuthorizationDecision {
  return { outcome: "deny", policyId: "sigil-eve-native-tools-v1", reason }
}

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}
