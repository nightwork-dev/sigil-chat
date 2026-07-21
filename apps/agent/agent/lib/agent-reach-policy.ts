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

export interface CurrentAgentReachAuthorization<T extends AgentReachCandidate> {
  canDiscover(candidate: T): boolean
  canRead(candidate: T): boolean
}

export interface ResolveAgentReachInput<T extends AgentReachCandidate> {
  readonly policy: AgentReachPolicy
  readonly candidates: readonly T[]
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
  links: readonly ScopeLink[],
): string[] {
  if (policy.kind === "principal") return []

  const scopeIds: string[] = []
  const seen = new Set<string>()
  for (const linkKind of policy.compositionLinkKinds) {
    for (const scopeId of traverseScopeLinks({
      rootScopeId: policy.homeScopeId,
      kind: linkKind,
      direction: "subjects",
      links,
    })) {
      if (seen.has(scopeId)) continue
      seen.add(scopeId)
      scopeIds.push(scopeId)
    }
  }
  if (!seen.has(policy.homeScopeId)) scopeIds.unshift(policy.homeScopeId)
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
