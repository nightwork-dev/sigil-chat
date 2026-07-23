export const SIGIL_SCOPE_HEADER = "x-sigil-scope"
export const SIGIL_SCOPE_AUTH_INFO_KEY = "sigilResourceScope"

export const RESOURCE_SCOPE_TIERS = [
  "session",
  "workspace",
  "project",
  "persona",
] as const
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
 * Normalize the portable resource key. String values use the canonical
 * `<tier>:<id>` wire form. Tier is location only; it must never be treated as
 * proof that the caller is a member of that scope.
 */
export function normalizeScope(
  value: ScopeInput | undefined,
): ResourceScope | undefined {
  if (typeof value === "string") {
    const normalized = value.trim()
    if (!normalized || hasInvalidScopeText(normalized)) return undefined

    const separator = normalized.indexOf(":")
    const tier = separator > 0 ? normalized.slice(0, separator) : undefined
    return tier !== undefined && isResourceScopeTier(tier)
      ? normalizeScope({ tier, id: normalized.slice(separator + 1) })
      : undefined
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

function hasInvalidScopeText(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value)
}
