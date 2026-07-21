/**
 * Composition is deliberately a graph separate from canonical ownership.
 * These types and pure helpers know nothing about membership or authorization.
 */
export type ScopeKind =
  | "installation"
  | "organization"
  | "project"
  | "workspace"
  | "session"
  | "personal"

export type ScopeLinkKind =
  | "mounted-in"
  | "contributes-defaults"
  | "rolls-up-to"
  | "discoverable-from"

export interface ScopeLink {
  readonly id: string
  readonly kind: ScopeLinkKind
  /** The participating scope. */
  readonly subjectScopeId: string
  /** The scope in which the subject participates. */
  readonly targetScopeId: string
  readonly order: number
  readonly createdAt: string
  readonly createdBy: string
  readonly revision: number
}

export type ScopeLinkTraversalDirection = "subjects" | "targets"

export interface ScopeLinkTraversalInput {
  readonly rootScopeId: string
  readonly kind: ScopeLinkKind
  readonly direction: ScopeLinkTraversalDirection
  readonly links: readonly ScopeLink[]
  /** Includes the root when omitted. */
  readonly includeRoot?: boolean
  /** Stops after this many edges; omitted means no artificial depth cap. */
  readonly maxDepth?: number
}

/**
 * Deterministic, relation-specific graph traversal. A diamond contributes a
 * scope once: the first ordered occurrence wins its position.
 */
export function traverseScopeLinks(input: ScopeLinkTraversalInput): string[] {
  const maxDepth = input.maxDepth ?? Number.POSITIVE_INFINITY
  if (
    maxDepth !== Number.POSITIVE_INFINITY &&
    (!Number.isInteger(maxDepth) || maxDepth < 0)
  ) {
    throw new Error("Scope link traversal max depth must be a non-negative integer.")
  }

  const matching = input.links.filter((link) => link.kind === input.kind)
  const seen = new Set<string>([input.rootScopeId])
  const result = input.includeRoot === false ? [] : [input.rootScopeId]
  const queue: Array<{ scopeId: string; depth: number }> = [
    { scopeId: input.rootScopeId, depth: 0 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || current.depth >= maxDepth) continue
    const next = sortScopeLinks(
      matching.filter((link) =>
        input.direction === "subjects"
          ? link.targetScopeId === current.scopeId
          : link.subjectScopeId === current.scopeId,
      ),
    )
    for (const link of next) {
      const scopeId =
        input.direction === "subjects" ? link.subjectScopeId : link.targetScopeId
      if (seen.has(scopeId)) continue
      seen.add(scopeId)
      result.push(scopeId)
      queue.push({ scopeId, depth: current.depth + 1 })
    }
  }

  return result
}

/** Whether adding subject -> target would close a cycle for this relation. */
export function wouldCreateScopeLinkCycle(
  candidate: Pick<ScopeLink, "kind" | "subjectScopeId" | "targetScopeId">,
  links: readonly ScopeLink[],
): boolean {
  if (candidate.subjectScopeId === candidate.targetScopeId) return true
  return traverseScopeLinks({
    rootScopeId: candidate.targetScopeId,
    kind: candidate.kind,
    direction: "targets",
    links,
  }).includes(candidate.subjectScopeId)
}

export function sortScopeLinks(links: readonly ScopeLink[]): ScopeLink[] {
  return [...links].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  )
}
