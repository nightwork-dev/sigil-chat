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
  normalizeSigilAgentProviders,
  type NormalizedSigilAgentModelPreset,
} from "@workspace/runtime-env/config"

import {
  DISCOVERED_MODELS_KEY,
  ENABLED_MODELS_KEY,
  type DiscoveredModelRecord,
} from "./installation-settings/registry"
import { installationSettings } from "./installation-settings/store"
import { isModelEnabledForNewSessions } from "./model-enablement"

const { value: sigilConfig } = await loadSigilConfigFixture()

/**
 * Kept in sync with apps/agent's own `DEFAULT_CONTEXT_WINDOW_TOKENS`
 * (model-provider.ts) — not imported across the app boundary, since
 * apps/web and apps/agent are separate deployables. Both exist only as a
 * last-resort fallback when neither a discovered entry nor its provider
 * states a context window.
 */
const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000

/** Every preset the fixture authors, deployment default first. */
export function authoredModelPresets(): NormalizedSigilAgentModelPreset[] {
  return normalizeSigilAgentModelPresets(sigilConfig.agent)
}

/**
 * Presets synthesized from MDL.2's discovery cache: a model Eve's live
 * catalog fetch reported that the fixture did not author.
 *
 * The cache (../discovered-models.server.ts) deliberately does not carry a
 * `baseUrl` or credential — those belong to the PROVIDER, so this looks the
 * authored provider up by `providerId` and borrows its transport facts. A
 * cached entry whose provider has since been removed or disabled from the
 * fixture is dropped rather than resolved against stale assumptions.
 */
export function discoveredModelPresets(
  cached: readonly DiscoveredModelRecord[] = installationSettings().get(
    DISCOVERED_MODELS_KEY,
  ),
): NormalizedSigilAgentModelPreset[] {
  const providers = normalizeSigilAgentProviders(sigilConfig.agent)
  return cached.flatMap((entry) => synthesizeDiscoveredPreset(entry, providers))
}

function synthesizeDiscoveredPreset(
  entry: DiscoveredModelRecord,
  providers: ReturnType<typeof normalizeSigilAgentProviders>,
): NormalizedSigilAgentModelPreset[] {
  const provider = providers.find(
    (candidate) => candidate.id === entry.providerId,
  )
  if (!provider || !provider.enabled) return []
  return [
    {
      id: entry.id,
      label: entry.label,
      providerId: provider.id,
      providerLabel: provider.label,
      provider: provider.kind,
      model: entry.model,
      // No fixture declaration behind a discovered model, so no fast mode
      // and no reasoning levels (MDL.4: declared, never sniffed).
      fastMode: false,
      capability: "chat",
      // No fixture veto exists for a model the fixture never authored — the
      // installation allow-list (checked separately, see
      // isSelectableModelPreset below) is the only thing standing between
      // this and a new session.
      enabled: true,
      isDeploymentDefault: false,
      source: "object",
      ...(provider.baseUrl !== undefined ? { baseUrl: provider.baseUrl } : {}),
      ...(provider.apiKeyEnv !== undefined
        ? { apiKeyEnv: provider.apiKeyEnv }
        : {}),
      contextWindowTokens:
        entry.contextWindowTokens ??
        provider.models[0]?.contextWindowTokens ??
        DEFAULT_CONTEXT_WINDOW_TOKENS,
    },
  ]
}

/**
 * Every preset a session may be created against: authored, plus whatever
 * MDL.2's discovery cache currently holds. Authored wins on an id collision —
 * unreachable in practice since a discovered id is only ever minted for a
 * model the fixture did NOT author (see model-endpoints.ts's
 * `authoredModelStrings` guard), but a duplicate concat is the wrong failure
 * mode if that ever changes, so authored is listed first and any duplicate
 * id from the cache is dropped.
 */
export function allModelPresets(
  cached?: readonly DiscoveredModelRecord[],
): NormalizedSigilAgentModelPreset[] {
  const authored = authoredModelPresets()
  const authoredIds = new Set(authored.map((preset) => preset.id))
  const discovered =
    cached === undefined
      ? discoveredModelPresets()
      : discoveredModelPresets(cached)
  return [
    ...authored,
    ...discovered.filter((preset) => !authoredIds.has(preset.id)),
  ]
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
  enabledIds?: readonly string[],
  discoveredCache?: readonly DiscoveredModelRecord[],
): BoundAgentModel | undefined {
  const trimmed = presetId.trim()
  if (!trimmed) return undefined
  const preset = allModelPresets(discoveredCache).find(
    (candidate) => candidate.id === trimmed,
  )
  if (!preset) return undefined
  const selectable =
    enabledIds === undefined
      ? isSelectableModelPreset(preset)
      : isSelectableModelPreset(preset, enabledIds)
  if (!selectable) return undefined
  return {
    presetId: preset.id,
    provider: preset.provider,
    modelId: preset.model,
  }
}
