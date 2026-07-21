export const BLACKBOARD_TIERS = ["session", "workspace", "project"] as const;
export type BlackboardTier = (typeof BLACKBOARD_TIERS)[number];

export interface BlackboardScope {
  tier: BlackboardTier;
  id: string;
}

/**
 * The store key a blackboard tier resolves to. `BlackboardRepository` is
 * already a flat, string-keyed store (packages/blackboard-store) — extending
 * it to workspace/project tiers is purely a matter of the key we hand it,
 * per the brief's "same store keyed by scope id" (no forked store). The
 * session tier keeps its historical bare-id key so every blackboard on disk
 * today stays readable; only the new tiers get a `<tier>:` prefix.
 *
 * That asymmetry is only collision-free because session ids are always
 * `crypto.randomUUID()` (agent-threads-domain.ts) and never contain `:`. A
 * session id shaped like `workspace:foo` would resolve to the exact same
 * store key as workspace `foo` — a cross-container read. Rather than trust
 * that invariant silently, reject it here so the boundary holds even if a
 * future session concept (an imported thread, a slug id, a migration) ever
 * produces a non-UUID id.
 */
export function blackboardStoreKey(scope: BlackboardScope): string {
  if (scope.tier === "session") {
    if (scope.id.includes(":")) {
      throw new Error(
        'Session blackboard scope id must not contain ":" — it would collide with a workspace/project store key.',
      );
    }
    return scope.id;
  }
  return `${scope.tier}:${scope.id}`;
}

/**
 * Nearest tier wins on read (spec: session → workspace → project). Given
 * whichever tiers are available to the caller, returns the nearest one that
 * actually has content — an empty/absent session blackboard falls through to
 * the workspace's, then the project's. Pure: callers do the fetching.
 */
export function resolveEffectiveBlackboardTier(
  docs: Partial<Record<BlackboardTier, { content: string } | undefined>>,
): BlackboardTier | undefined {
  for (const tier of BLACKBOARD_TIERS) {
    if (docs[tier]?.content) return tier;
  }
  return undefined;
}
