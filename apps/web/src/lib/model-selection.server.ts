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
  loadSigilConfigFixture,
  normalizeSigilAgentModelPresets,
  type NormalizedSigilAgentModelPreset,
} from "@workspace/runtime-env/config"

import { ENABLED_MODELS_KEY } from "./installation-settings/registry"
import { installationSettings } from "./installation-settings/store"
import { isModelEnabledForNewSessions } from "./model-enablement"

const { value: sigilConfig } = await loadSigilConfigFixture()

/** Every preset the fixture authors, deployment default first. */
export function authoredModelPresets(): NormalizedSigilAgentModelPreset[] {
  return normalizeSigilAgentModelPresets(sigilConfig.agent)
}

/**
 * Whether a preset may be selected for a NEW session.
 *
 * ALLOW-LIST (David, 2026-07-31: "New should default to disabled — so
 * something like Fable gets added and suddenly users can burn through
 * quota"). Nothing is selectable until an owner explicitly enables it, with
 * the deployment default implicitly enabled so a fresh install can still
 * create sessions. The set is installation-scoped, so this verdict is the
 * same for every principal — that is what makes it a spending control rather
 * than a per-account preference.
 *
 * `enabledIds` is a parameter with a default rather than a lookup inside the
 * body so the policy can be exercised against a known set; production callers
 * never pass it and therefore cannot pass a wider one.
 */
export function isSelectableModelPreset(
  preset: NormalizedSigilAgentModelPreset,
  enabledIds: readonly string[] = installationSettings().get(
    ENABLED_MODELS_KEY,
  ),
): boolean {
  return isModelEnabledForNewSessions(preset, enabledIds)
}

/**
 * Resolve a requested preset id into the immutable snapshot to bind.
 *
 * Returns undefined for unknown ids, for ids the fixture author disabled, and
 * for ids no owner has enabled — one rejection path, by construction, so a
 * hand-crafted create request cannot tell them apart or slip between them.
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
