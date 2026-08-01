// Server half of the model allow-list: who may change it, and what a change
// is allowed to be (MDL.2).
//
// The read is open to any signed-in principal and the write is owner-only.
// That asymmetry is the whole point of putting the enabled set in an
// INSTALLATION-scoped tier rather than per-user records: one set governs
// everyone, so a member cannot enable an expensive model for themselves.
//
// Owner verification reuses `requireOwner` from ./auth/session — the same gate
// the model-endpoint relay uses. There is deliberately no second notion of
// "owner" here; RBAC is recorded future work (David, 2026-07-31: "RBAC
// eventually. But installation settings"), and when it arrives it replaces
// this one call rather than a scattered set of role checks.

import type { SigilAuthSession } from "./auth/server"
import { getSession, requireOwner, requireSession } from "./auth/session"
import { ENABLED_MODELS_KEY } from "./installation-settings/registry"
import {
  installationSettings,
  type InstallationSettingsStore,
} from "./installation-settings/store"
import {
  applyModelEnablement,
  ModelEnablementRefusedError,
  parseSetModelEnabledRequest,
  type ModelEnablementCandidate,
  type SetModelEnabledRequest,
} from "./model-enablement"
import { allModelPresets } from "./model-selection.server"

export interface ModelEnablementDependencies {
  store: InstallationSettingsStore
  /**
   * Every model this deployment CAN offer: fixture-authored, plus whatever
   * MDL.2's catalog discovery has cached. A discovered id must appear here
   * for `applyModelEnablement` to accept enabling it — otherwise a
   * discovered model would render as a toggle in Settings → Models that
   * always refuses the very click it invites.
   */
  presets(): readonly ModelEnablementCandidate[]
}

function defaultDependencies(): ModelEnablementDependencies {
  return {
    store: installationSettings(),
    presets: allModelPresets,
  }
}

export async function readEnabledModelIds(): Promise<string[]> {
  // Any signed-in principal: the set is deployment policy, and the server
  // enforces it identically for everyone regardless of what it reported here.
  requireSession(await getSession())
  return installationSettings().get(ENABLED_MODELS_KEY)
}

export async function setInstallationModelEnabled(
  input: SetModelEnabledRequest,
): Promise<string[]> {
  return applyOwnerModelEnablement(await getSession(), input)
}

/**
 * The whole write path, session in hand.
 *
 * Kept as one exported function taking the session and its dependencies so a
 * test exercises the real authorization it ships with, rather than a
 * re-implementation of it beside the code that matters.
 */
export function applyOwnerModelEnablement(
  session: SigilAuthSession | null,
  input: SetModelEnabledRequest,
  dependencies: ModelEnablementDependencies = defaultDependencies(),
): string[] {
  requireOwner(session)

  // Re-validate rather than trust the caller's shape: this function is also
  // reachable from server code that did not pass through the fn validator.
  const request = parseSetModelEnabledRequest(input)

  const authored = dependencies.presets()
  const candidates = request.presetIds.map((presetId) => {
    const candidate = authored.find((preset) => preset.id === presetId)
    if (!candidate) {
      throw new ModelEnablementRefusedError(
        `"${presetId}" is not a model this deployment authors.`,
      )
    }
    return candidate
  })

  const next = applyModelEnablement(
    dependencies.store.get(ENABLED_MODELS_KEY),
    candidates,
    request.enabled,
  )
  dependencies.store.set(ENABLED_MODELS_KEY, next)
  return next
}
