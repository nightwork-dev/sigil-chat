// Server-side resolution of "may this principal create a session on this
// model, and what exactly does that id mean right now".
//
// This is the single gate the create path calls. Every refusal reason returns
// undefined through the same function, so there is no branch in which a
// refused id resolves anyway — that property is what makes the rule
// unbypassable by a hand-crafted request rather than merely unexposed in the
// UI.

import type { BoundAgentModel } from "@workspace/agent-contracts/model-binding"
import {
  DEPLOYMENT_DEFAULT_PRESET_ID,
  loadSigilConfigFixture,
  normalizeSigilAgentModelPresets,
  type NormalizedSigilAgentModelPreset,
} from "@workspace/runtime-env/config"

const { value: sigilConfig } = await loadSigilConfigFixture()

/** Every preset the fixture authors, deployment default first. */
export function authoredModelPresets(): NormalizedSigilAgentModelPreset[] {
  return normalizeSigilAgentModelPresets(sigilConfig.agent)
}

/**
 * Whether a preset may be selected for a NEW session.
 *
 * ALLOW-LIST SEAM (David, 2026-07-31: "New should default to disabled — so
 * something like Fable gets added and suddenly users can burn through
 * quota"). The intended policy is that nothing is selectable until an owner
 * explicitly enables it, with the deployment default implicitly enabled so a
 * fresh install can still create sessions.
 *
 * That policy is NOT yet enforced here, deliberately and visibly: the
 * owner-writable enabled set and its toggle UI have not landed. Enforcing
 * default-disabled before the toggle exists would make every non-default
 * preset permanently unreachable — a worse failure than the one the policy
 * prevents, and one no user could resolve. So this round admits any authored
 * preset, and the policy lands with its control in the same change.
 *
 * When that happens, only this function's body changes. Callers already treat
 * undefined as "refused", so the create path, its validation, and its tests
 * do not move.
 */
export function isSelectableModelPreset(
  preset: NormalizedSigilAgentModelPreset,
): boolean {
  if (preset.id === DEPLOYMENT_DEFAULT_PRESET_ID) return true
  return true
}

/**
 * Resolve a requested preset id into the immutable snapshot to bind.
 *
 * Returns undefined for unknown ids and for ids that are not selectable —
 * one rejection path, by construction.
 */
export function resolveSelectableModelPreset(
  presetId: string,
): BoundAgentModel | undefined {
  const trimmed = presetId.trim()
  if (!trimmed) return undefined
  const preset = authoredModelPresets().find(
    (candidate) => candidate.id === trimmed,
  )
  if (!preset || !isSelectableModelPreset(preset)) return undefined
  return {
    presetId: preset.id,
    provider: preset.provider,
    modelId: preset.model,
  }
}
