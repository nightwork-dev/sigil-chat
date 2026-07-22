import {
  traverseScopeLinks,
  type ScopeKind,
  type ScopeLink,
  type ScopeLinkKind,
} from "./scope-graph"

/**
 * Declares candidate generation only. It carries no credential and never
 * substitutes for authorization at discovery, read, or invocation time.
 */
export type AgentReachPolicy = ScopeAgentReachPolicy | PrincipalAgentReachPolicy

export interface ScopeAgentReachPolicy {
  readonly kind: "scope"
  readonly homeScopeId: string
  readonly homeScopeKind: ScopeKind
  /** Only these composition relations may add to the declared reach. */
  readonly compositionLinkKinds: readonly ScopeLinkKind[]
  /** The home is always included; this limits eligible descendant kinds. */
  readonly descendantScopeKinds: readonly ScopeKind[]
}

export interface PrincipalAgentReachPolicy {
  readonly kind: "principal"
}

export interface AgentReachCandidate {
  /** Stable resource identity; duplicate mounts resolve once. */
  readonly id: string
  readonly homeScopeId: string
  readonly homeScopeKind: ScopeKind
}

/** A trusted projection of canonical ownership, not a composition relation. */
export interface CanonicalDescendantScope {
  readonly scopeId: string
  readonly scopeKind: ScopeKind
}

export interface CurrentAgentReachAuthorization<T extends AgentReachCandidate> {
  canDiscover(candidate: T): boolean
  canRead(candidate: T): boolean
}

export interface ResolveAgentReachInput<T extends AgentReachCandidate> {
  readonly policy: AgentReachPolicy
  readonly candidates: readonly T[]
  /**
   * Supplied by the scope registry for the policy home. These are seeded into
   * reach before optional composition links are traversed.
   */
  readonly canonicalDescendants?: readonly CanonicalDescendantScope[]
  readonly links?: readonly ScopeLink[]
  /** Re-injected for every resolve; this is intentionally not cached. */
  readonly authorization: CurrentAgentReachAuthorization<T>
}

export interface ResolvedAgentReach<T extends AgentReachCandidate> {
  readonly candidateScopeIds: readonly string[]
  readonly discoverable: readonly T[]
  readonly readable: readonly T[]
}

/**
 * Produces an authorization-filtered candidate projection. Re-run this helper
 * for every operation with current authorization; stale reach results are not
 * credentials and must not be reused after a grant changes.
 */
export function resolveAgentReach<T extends AgentReachCandidate>(
  input: ResolveAgentReachInput<T>,
): ResolvedAgentReach<T> {
  const candidateScopeIds = resolveCandidateScopeIds(
    input.policy,
    input.canonicalDescendants ?? [],
    input.links ?? [],
  )
  const eligible = uniqueCandidates(input.candidates).filter((candidate) =>
    isWithinPolicyReach(candidate, input.policy, candidateScopeIds),
  )

  return {
    candidateScopeIds,
    discoverable: eligible.filter(input.authorization.canDiscover),
    readable: eligible.filter(input.authorization.canRead),
  }
}

function resolveCandidateScopeIds(
  policy: AgentReachPolicy,
  canonicalDescendants: readonly CanonicalDescendantScope[],
  links: readonly ScopeLink[],
): string[] {
  if (policy.kind === "principal") return []

  const scopeIds = [policy.homeScopeId]
  const seen = new Set(scopeIds)
  for (const descendant of [...canonicalDescendants].sort(
    (left, right) => left.scopeId.localeCompare(right.scopeId),
  )) {
    if (
      !policy.descendantScopeKinds.includes(descendant.scopeKind) ||
      seen.has(descendant.scopeId)
    ) {
      continue
    }
    seen.add(descendant.scopeId)
    scopeIds.push(descendant.scopeId)
  }

  // Composition is opt-in. Traverse only the declared relations, starting
  // from the trusted canonical closure and continuing through those same
  // relations deterministically.
  for (let index = 0; index < scopeIds.length; index += 1) {
    const rootScopeId = scopeIds[index]
    if (!rootScopeId) continue
    for (const linkKind of policy.compositionLinkKinds) {
      for (const scopeId of traverseScopeLinks({
        rootScopeId,
        kind: linkKind,
        direction: "subjects",
        links,
      })) {
        if (seen.has(scopeId)) continue
        seen.add(scopeId)
        scopeIds.push(scopeId)
      }
    }
  }
  return scopeIds
}

function isWithinPolicyReach(
  candidate: AgentReachCandidate,
  policy: AgentReachPolicy,
  candidateScopeIds: readonly string[],
): boolean {
  if (policy.kind === "principal") return true
  if (!candidateScopeIds.includes(candidate.homeScopeId)) return false
  return (
    candidate.homeScopeId === policy.homeScopeId ||
    policy.descendantScopeKinds.includes(candidate.homeScopeKind)
  )
}

function uniqueCandidates<T extends AgentReachCandidate>(
  candidates: readonly T[],
): T[] {
  const sorted = [...candidates].sort(
    (left, right) =>
      left.id.localeCompare(right.id) ||
      left.homeScopeId.localeCompare(right.homeScopeId),
  )
  const seen = new Set<string>()
  return sorted.filter((candidate) => {
    if (seen.has(candidate.id)) return false
    seen.add(candidate.id)
    return true
  })
}
