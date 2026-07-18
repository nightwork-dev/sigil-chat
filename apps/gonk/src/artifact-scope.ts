export const SIGIL_SCOPE_HEADER = "x-sigil-scope"
/** Legacy header retained for callers that only know about session scopes. */
export const SIGIL_SESSION_SCOPE_HEADER = "x-sigil-session-id"
export const SIGIL_SCOPE_AUTH_INFO_KEY = "sigilResourceScope"
/** Legacy auth-info key retained for host adapters during the transition. */
export const SIGIL_SESSION_SCOPE_AUTH_INFO_KEY = "sigilSessionScope"

export const RESOURCE_SCOPE_TIERS = ["session", "project", "persona"] as const
export type ResourceScopeTier = (typeof RESOURCE_SCOPE_TIERS)[number]

export interface ResourceScope {
  readonly tier: ResourceScopeTier
  readonly id: string
}

export type ScopeInput = ResourceScope | string

const MAX_SCOPE_ID_LENGTH = 256

export function isResourceScopeTier(value: unknown): value is ResourceScopeTier {
  return (
    typeof value === "string" &&
    (RESOURCE_SCOPE_TIERS as readonly string[]).includes(value)
  )
}

/**
 * Normalize the portable resource key. A bare value is the legacy session-id
 * form; the canonical wire form is `<tier>:<id>`. Tier is location only. It
 * must never be treated as proof that the caller is a member of that scope.
 */
export function normalizeScope(
  value: ScopeInput | undefined,
): ResourceScope | undefined {
  if (typeof value === "string") {
    const normalized = value.trim()
    if (!normalized || hasInvalidScopeText(normalized)) return undefined

    const separator = normalized.indexOf(":")
    const tier = separator > 0 ? normalized.slice(0, separator) : undefined
    if (tier !== undefined && isResourceScopeTier(tier)) {
      return normalizeScope({
        tier,
        id: normalized.slice(separator + 1),
      })
    }

    return normalizeScope({ tier: "session", id: normalized })
  }

  if (
    value === undefined ||
    !isResourceScopeTier(value.tier) ||
    typeof value.id !== "string"
  ) {
    return undefined
  }

  const id = value.id.trim()
  if (!id || id.length > MAX_SCOPE_ID_LENGTH || hasInvalidScopeText(id)) {
    return undefined
  }

  return { tier: value.tier, id }
}

/** Canonical value for `x-sigil-scope`. */
export function formatScopeHeader(value: ScopeInput): string | undefined {
  const scope = normalizeScope(value)
  return scope ? `${scope.tier}:${scope.id}` : undefined
}

/**
 * Resolve the new header first and fall back to the old session header only
 * when the new header is absent. This keeps old Eve/browser callers working
 * without making the session tier special in the storage model.
 */
export function normalizeScopeHeaders(
  scopeHeader: string | undefined,
  legacySessionHeader: string | undefined,
): ResourceScope | undefined {
  return scopeHeader !== undefined
    ? normalizeScope(scopeHeader)
    : normalizeScope(legacySessionHeader)
}

/** Backwards-compatible helper for code that explicitly needs a session id. */
export function normalizeSessionScope(
  value: string | undefined,
): string | undefined {
  const scope = normalizeScope(value)
  return scope?.tier === "session" ? scope.id : undefined
}

function hasInvalidScopeText(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value)
}
