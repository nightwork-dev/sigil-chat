// The write side of MDL.2's discovery cache: turning Eve's live catalog
// answer into the small, credential-free record the synchronous create-time
// gate reads.
//
// Eve is the only process that can reach a provider's own catalog endpoint —
// it holds the credential the fetch needs. But the consumer that must not be
// bypassable, `resolveSelectableModelPreset`, runs synchronously inside
// thread creation (see ../installation-settings/store.ts) and cannot await a
// network call to Eve on every session create. This module is the bridge:
// every time the owner's browser asks for the inventory (readModelEndpointInventory
// in ./model-endpoints.server.ts), whatever Eve reported as `discovered: true`
// is written into the installation-settings store as a cache, so a discovered
// model an owner later enables can resolve without hitting the network again.
//
// Deliberately lossy: only `id`, `providerId`, `model`, `label`, and
// `contextWindowTokens` are cached — never a baseUrl or credential reference.
// Those stay one place, the fixture's authored provider entry, which
// ./model-selection.server.ts looks up by `providerId` at resolve time.

import {
  DISCOVERED_MODELS_KEY,
  type DiscoveredModelRecord,
} from "./installation-settings/registry"
import {
  installationSettings,
  type InstallationSettingsStore,
} from "./installation-settings/store"
import type { ModelProviderRecord } from "./model-endpoints"

/**
 * Every `discovered: true` model in an inventory answer, shaped for the
 * cache. Split out from `persistDiscoveredModels` so the extraction — the
 * part with a decision worth pinning in a test — is exercisable without a
 * store at all.
 */
export function extractDiscoveredModels(
  providers: readonly ModelProviderRecord[],
): DiscoveredModelRecord[] {
  const next: DiscoveredModelRecord[] = []
  for (const provider of providers) {
    for (const model of provider.models) {
      if (!model.discovered) continue
      next.push({
        id: model.id,
        providerId: provider.id,
        model: model.model,
        label: model.label,
        ...(model.contextWindowTokens > 0
          ? { contextWindowTokens: model.contextWindowTokens }
          : {}),
      })
    }
  }
  return next
}

/**
 * Extract every `discovered: true` model out of an inventory answer and
 * persist it as the cache the create-time gate reads.
 *
 * Replaces the whole cached set rather than merging: a model no longer
 * reported (the provider stopped serving it, or the fixture caught up and
 * authored it) should stop being offered as "discovered" the next time an
 * owner looks, not accumulate forever. Silent no-op on a malformed payload —
 * this runs as a side effect of a read, so it must never turn a successful
 * inventory fetch into a thrown error.
 *
 * `store` defaults to the real shared singleton; overridable so tests exercise
 * the write without touching the real project store.
 */
export function persistDiscoveredModels(
  providers: readonly ModelProviderRecord[],
  store: Pick<InstallationSettingsStore, "set"> = installationSettings(),
): void {
  try {
    store.set(DISCOVERED_MODELS_KEY, extractDiscoveredModels(providers))
  } catch {
    // A registry rejection here means Eve reported something the validator
    // does not accept (an id the grammar refuses, a duplicate). Losing the
    // cache update is the safe failure — the inventory the owner is looking
    // at right now is unaffected, and the create-time gate simply keeps
    // whatever it cached last rather than refusing every session.
  }
}
