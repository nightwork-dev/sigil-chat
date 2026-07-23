import type { AuthContext, AuthenticatedPrincipal } from "@gonk/auth"

export type SigilResourceScope = {
  tier: string
  id: string
  resourceScope: string
}

export type SigilToolHostContext = {
  resourceScope?: unknown
  applicationThreadId?: string
  personaId?: string
}

export type DelegatedHumanPrincipal = AuthenticatedPrincipal & {
  kind: "human"
}

export function toHostContext(host: unknown): SigilToolHostContext | undefined {
  return isRecord(host) ? host : undefined
}

export function requireDelegatedHumanAuth(
  auth: AuthContext | undefined,
  toolFamily: string,
): AuthContext & { principal: DelegatedHumanPrincipal } {
  if (
    !auth?.principal ||
    auth.principal.kind !== "human" ||
    !auth.principal.delegation?.actorSessionId
  ) {
    throw new Error(
      `${toolFamily} tools require a delegated authenticated human principal with a trusted actor session.`,
    )
  }
  return auth as AuthContext & { principal: DelegatedHumanPrincipal }
}

export async function requireScopeAccess(
  auth: AuthContext | undefined,
  target: SigilResourceScope,
  toolFamily: string,
): Promise<DelegatedHumanPrincipal> {
  const context = requireDelegatedHumanAuth(auth, toolFamily)
  const authorization = await context.authorize({
    action: "application:scope.tool",
    resource: {
      kind: "application:scope",
      target: target.resourceScope,
      scope: toAuthzScope(target.tier),
    },
  })
  if (authorization?.outcome !== "allow") {
    throw new Error(
      `Principal ${context.principal.id} is not authorized for ${target.resourceScope}.`,
    )
  }
  return context.principal
}

export function resolveTargetScope(
  intendedScopeId: string | undefined,
  host: SigilToolHostContext | undefined,
  toolFamily: string,
): SigilResourceScope {
  const current = parseScope(host?.resourceScope)
  if (!current) {
    throw new Error(
      `${toolFamily} tools require a trusted current resource or session scope.`,
    )
  }
  if (!intendedScopeId) return current

  const trimmed = intendedScopeId.trim()
  const intended = parseScope(trimmed)
  if (intended && intended.resourceScope === current.resourceScope)
    return current
  if (!intended && trimmed === current.id) return current
  throw new Error(
    `${toolFamily} tools cannot switch target scope from the authenticated request scope.`,
  )
}

export function resolveAgentSessionId(
  principal: AuthenticatedPrincipal,
  toolFamily: string,
): string {
  const actorSessionId = principal.delegation?.actorSessionId
  if (!actorSessionId) {
    throw new Error(
      `${toolFamily} tools require a trusted delegated actor session.`,
    )
  }
  return actorSessionId
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

export function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || isText(value)
}

export function isOptionalInteger(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0)
  )
}

export function isOptionalTextArray(
  value: unknown,
): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isText))
}

function toAuthzScope(
  tier: string,
):
  | "global"
  | "persona"
  | "project"
  | "directory"
  | "session"
  | "tenant"
  | "workspace"
  | "resource" {
  switch (tier) {
    case "persona":
    case "project":
    case "directory":
    case "session":
    case "tenant":
    case "workspace":
    case "resource":
      return tier
    default:
      return "resource"
  }
}

function parseScope(value: unknown): SigilResourceScope | undefined {
  if (typeof value === "string") {
    const separator = value.indexOf(":")
    if (separator < 1 || separator === value.length - 1) return undefined
    const tier = value.slice(0, separator)
    const id = value.slice(separator + 1)
    return { tier, id, resourceScope: value }
  }
  if (isRecord(value) && isText(value.tier) && isText(value.id)) {
    return {
      tier: value.tier,
      id: value.id,
      resourceScope: `${value.tier}:${value.id}`,
    }
  }
  return undefined
}
