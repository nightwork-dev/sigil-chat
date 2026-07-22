export interface ScopedResourceRef<T = unknown> {
  readonly resourceId: string
  readonly homeScopeId: string
  readonly mountedScopeIds: readonly string[]
  readonly value: T
}

export interface ResolvedScopedResource<
  T = unknown,
> extends ScopedResourceRef<T> {
  readonly matchedScopeIds: readonly string[]
}

export function resolveScopedResources<T>(input: {
  resources: readonly ScopedResourceRef<T>[]
  viewScopeIds: readonly string[]
  canRead(resource: ScopedResourceRef<T>): boolean
}): ResolvedScopedResource<T>[] {
  const viewOrder = new Map(
    input.viewScopeIds.map((scopeId, index) => [scopeId, index]),
  )
  const byIdentity = new Map<string, ResolvedScopedResource<T>>()

  for (const resource of input.resources) {
    const matchedScopeIds = [resource.homeScopeId, ...resource.mountedScopeIds]
      .filter((scopeId, index, all) => all.indexOf(scopeId) === index)
      .filter((scopeId) => viewOrder.has(scopeId))
      .sort((left, right) => viewOrder.get(left)! - viewOrder.get(right)!)
    if (matchedScopeIds.length === 0 || !input.canRead(resource)) continue

    const existing = byIdentity.get(resource.resourceId)
    if (existing && existing.homeScopeId !== resource.homeScopeId) {
      throw new Error(
        `Resource ${resource.resourceId} has conflicting canonical homes.`,
      )
    }
    if (existing) {
      byIdentity.set(resource.resourceId, {
        ...existing,
        mountedScopeIds: uniqueSorted([
          ...existing.mountedScopeIds,
          ...resource.mountedScopeIds.filter((scopeId) =>
            viewOrder.has(scopeId),
          ),
        ]),
        matchedScopeIds: input.viewScopeIds.filter((scopeId) =>
          new Set([...existing.matchedScopeIds, ...matchedScopeIds]).has(
            scopeId,
          ),
        ),
      })
      continue
    }
    byIdentity.set(resource.resourceId, {
      ...resource,
      mountedScopeIds: uniqueSorted(
        resource.mountedScopeIds.filter((scopeId) => viewOrder.has(scopeId)),
      ),
      matchedScopeIds,
    })
  }

  return [...byIdentity.values()].sort(
    (left, right) =>
      input.viewScopeIds.indexOf(left.matchedScopeIds[0]!) -
        input.viewScopeIds.indexOf(right.matchedScopeIds[0]!) ||
      left.resourceId.localeCompare(right.resourceId),
  )
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}
