/**
 * Neutral authorization vocabulary shared at the Sigil host boundaries.
 *
 * A scope is a location, not a credential. Callers provide the target's
 * canonical home separately so a policy can distinguish an explicit resource
 * grant from membership inherited through that home. SC.2 will supply richer
 * scope records; this contract intentionally depends only on stable strings.
 */
/**
 * `write` is distinct from `read` on purpose: a grant that permits reading a
 * container must not, by omission, permit mutating what lives in it. Before
 * this existed every artifact mutation asked the policy for "read", so a
 * read-only grant authorized writes (SC.9, 2026-07-24). Added while no
 * issuance surface exists yet, so no persisted grant needs migrating.
 */
export type ScopeAuthorizationAction = "discover" | "read" | "write" | "tool";

export interface ScopeAuthorizationTarget {
  readonly resourceScope: string;
  readonly canonicalHomeScope?: string;
}

export interface ScopeAuthorizationRequest extends ScopeAuthorizationTarget {
  readonly action: ScopeAuthorizationAction;
  readonly principalId: string;
}

export interface ScopeGrant {
  readonly actions: readonly ScopeAuthorizationAction[];
  readonly principalId: string;
  readonly resourceScope: string;
}

export interface ScopeAuthorizationPolicy {
  authorize(input: ScopeAuthorizationRequest): boolean;
}

/**
 * A grant applies to the resource identity itself, never to a presentation
 * path, mount, annotation, or active perspective. Policies that support
 * home-derived membership make that a separate, explicit decision.
 */
export function hasScopeGrant(
  grants: readonly ScopeGrant[],
  request: ScopeAuthorizationRequest,
): boolean {
  return grants.some(
    (grant) =>
      grant.principalId === request.principalId &&
      grant.resourceScope === request.resourceScope &&
      grant.actions.includes(request.action),
  );
}
