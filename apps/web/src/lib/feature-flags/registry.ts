// Typed registry of declared feature flags (FLAG.1).
//
// Declaration as data: a flag is a row here, not a free-typed string a caller
// invents at the call site. The Settings → Flags surface lists exactly what
// is declared below, and every enforcement seam that checks a flag id
// resolves it against this same table — an id absent from it is not a flag,
// it is a typo, and evaluates default-off (see ../feature-flags.ts).
//
// Pure and dependency-free, same reason as ../installation-settings/registry.ts:
// the declarations need to be importable by client code (the Settings UI, a
// route guard's `beforeLoad`) without pulling server-only store code into the
// browser bundle.
//
// Out of scope for this pass (David, 2026-08-01 via FLAG.1): per-scope/
// per-user targeting, percentage rollout, and RBAC on who may flip a flag —
// every flag here is installation-wide and owner-gated, same as model
// enablement.

export interface FeatureFlagDefinition {
  /** Dotted id, e.g. `surfaces.reducerStudio`. Stable — it is the storage key. */
  readonly id: string
  /** Shown beside the toggle in Settings → Flags. */
  readonly description: string
  /** What an installation that has never overridden this flag resolves to. */
  readonly defaultEnabled: boolean
  /**
   * Whether this flag is listed in Settings → Flags. Every flag today is
   * owner-visible; the field exists so a future internal-only flag (one an
   * enforcement seam checks but no owner needs to see a switch for) doesn't
   * have to become a visible one to exist.
   */
  readonly ownerVisible: boolean
}

export function defineFeatureFlag(
  definition: FeatureFlagDefinition,
): FeatureFlagDefinition {
  return definition
}

export const FEATURE_FLAG_REGISTRY = {
  // Gates the Studio reducer-graph demonstration (route guard on
  // /demos/studio, surface mounting on the /demos directory card) — the
  // first real consumer wired for this pass (FLAG.1 shape point 6). Defaults
  // on: Studio already ships today, so landing this flag must not change who
  // can reach it until an owner acts.
  "surfaces.reducerStudio": defineFeatureFlag({
    id: "surfaces.reducerStudio",
    description:
      "Show the Studio reducer-graph demonstration in the Demos directory and allow /demos/studio.",
    defaultEnabled: true,
    ownerVisible: true,
  }),
} as const satisfies Record<string, FeatureFlagDefinition>

export type FeatureFlagId = keyof typeof FEATURE_FLAG_REGISTRY

export function isKnownFeatureFlagId(id: string): id is FeatureFlagId {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAG_REGISTRY, id)
}

export function getFeatureFlagDefinition(id: FeatureFlagId): FeatureFlagDefinition {
  return FEATURE_FLAG_REGISTRY[id]
}

export function listFeatureFlagDefinitions(): readonly FeatureFlagDefinition[] {
  return Object.values(FEATURE_FLAG_REGISTRY)
}
