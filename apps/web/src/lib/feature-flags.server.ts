// Server half of feature flags: who may flip one, and evaluating the
// installation's current overrides for a server-side enforcement seam
// (FLAG.1). Same shape as ./model-enablement.server.ts, same reason: the
// read is open to any signed-in principal and the write is owner-only,
// because a flag is deployment policy, not a personal preference.
//
// Owner verification reuses `requireOwner` from ./auth/session — the same
// gate model enablement uses. There is deliberately no second notion of
// "owner" here; RBAC on who may flip which flag is recorded future work
// (David, 2026-08-01, same ruling FLAG.1 inherits from MDL.2's "RBAC
// eventually. But installation settings").

import type { SigilAuthSession } from "./auth/server"
import { getSession, requireOwner, requireSession } from "./auth/session"
import {
  isFeatureFlagEnabled,
  parseSetFeatureFlagRequest,
  resolveFeatureFlagStates,
  type FeatureFlagState,
  type SetFeatureFlagRequest,
} from "./feature-flags"
import type { FeatureFlagId } from "./feature-flags/registry"
import { FEATURE_FLAG_OVERRIDES_KEY } from "./installation-settings/registry"
import {
  installationSettings,
  type InstallationSettingsStore,
} from "./installation-settings/store"

export interface FeatureFlagDependencies {
  store: InstallationSettingsStore
}

function defaultDependencies(): FeatureFlagDependencies {
  return { store: installationSettings() }
}

export async function readFeatureFlags(): Promise<FeatureFlagState[]> {
  // Any signed-in principal: flags are deployment policy, and every
  // enforcement seam applies the same verdict for everyone regardless of
  // what this read reported.
  requireSession(await getSession())
  return resolveFeatureFlagStates(
    installationSettings().get(FEATURE_FLAG_OVERRIDES_KEY),
  )
}

export async function setInstallationFeatureFlag(
  input: SetFeatureFlagRequest,
): Promise<FeatureFlagState[]> {
  return applyOwnerFeatureFlag(await getSession(), input)
}

/**
 * The whole write path, session in hand.
 *
 * Kept as one exported function taking the session and its dependencies so a
 * test exercises the real authorization it ships with, rather than a
 * re-implementation of it beside the code that matters. The
 * "refuses a member's write" test in feature-flags.server.test.ts is
 * red-without-fix: delete the `requireOwner` call below and that test fails.
 */
export function applyOwnerFeatureFlag(
  session: SigilAuthSession | null,
  input: SetFeatureFlagRequest,
  dependencies: FeatureFlagDependencies = defaultDependencies(),
): FeatureFlagState[] {
  requireOwner(session)

  // Re-validate rather than trust the caller's shape: this function is also
  // reachable from server code that did not pass through the fn validator.
  const request = parseSetFeatureFlagRequest(input)

  const current = dependencies.store.get(FEATURE_FLAG_OVERRIDES_KEY)
  const next = { ...current, [request.id]: request.enabled }
  dependencies.store.set(FEATURE_FLAG_OVERRIDES_KEY, next)
  return resolveFeatureFlagStates(next)
}

/**
 * Synchronous evaluation for a server-side enforcement seam that already has
 * a flag id in hand (tool exposure, a non-route policy check) and does not
 * need the full declared-flags listing. No session required: the verdict is
 * the same for every principal, same as `readEnabledModelIds`'s reasoning in
 * ./model-enablement.server.ts.
 *
 * Route guards should go through the `fetchFeatureFlags` server fn instead
 * (see routes/_app/demos.studio.tsx) — importing this file directly from a
 * route file would pull the installation-settings store into the client
 * bundle, the same boundary ./model-enablement.server.ts already documents.
 */
export function isInstallationFlagEnabled(id: FeatureFlagId): boolean {
  return isFeatureFlagEnabled(
    id,
    installationSettings().get(FEATURE_FLAG_OVERRIDES_KEY),
  )
}
