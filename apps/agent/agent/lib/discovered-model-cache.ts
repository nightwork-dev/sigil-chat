// Read-only view, from Eve's side, of MDL.2's discovery cache.
//
// The cache is WRITTEN by apps/web (../../../web/src/lib/discovered-models.server.ts)
// as a side effect of the owner viewing Settings → Models — Eve is where the
// live catalog fetch runs (it holds the credential), but the create-time
// allow-list gate and this session-model resolver both need a discovered
// model's identity WITHOUT redoing that network call, so web caches it and
// both processes read the same record. They share it because they share the
// same Mirk-backed project-tier KV store under one `SIGIL_DATA_DIR` — the
// same arrangement this app already uses for the workspace/project/scope
// registries (see workspace-registry.ts).
//
// Kept in sync with apps/web/src/lib/installation-settings/registry.ts:
// NAMESPACE, DISCOVERED_MODELS_KEY, and the record shape below must match
// what that file writes. Not imported directly — apps/web and apps/agent are
// separate deployables with no path alias between them — so a rename on
// either side has to be made on both.

import { createScope } from "@gonk/scope"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import type { KvStore } from "@gonk/store/types"

/** Kept in sync with InstallationSettingsStore's NAMESPACE in apps/web. */
const NAMESPACE = "sigil-chat.installation-settings.v1"
/** Kept in sync with DISCOVERED_MODELS_KEY in apps/web's registry.ts. */
const DISCOVERED_MODELS_KEY = "models.discovered"

/** Kept in sync with DiscoveredModelRecord in apps/web's registry.ts. */
export interface DiscoveredModelCacheEntry {
  readonly id: string
  readonly providerId: string
  readonly model: string
  readonly label: string
  readonly contextWindowTokens?: number
}

export interface DiscoveredModelCacheOptions {
  /** Inject a store for tests; production resolves the shared project-tier KV. */
  kv?: KvStore<unknown>
}

/**
 * Every discovered model currently cached, or `[]` for anything unreadable.
 *
 * Read failures (no store configured, a corrupt record, a shape the
 * validator below refuses) resolve to "no discovered models" rather than
 * throwing — this runs on the session-resolution path, where the safe
 * default when the cache is unusable is to fall back to the fixture-authored
 * presets, not to fail a session that asked for something ordinary.
 */
export function readDiscoveredModelCache(
  options: DiscoveredModelCacheOptions = {},
): DiscoveredModelCacheEntry[] {
  try {
    const kv = options.kv ?? projectKv()
    const stored = kv.get(DISCOVERED_MODELS_KEY)
    return Array.isArray(stored) ? stored.filter(isDiscoveredModelCacheEntry) : []
  } catch {
    return []
  }
}

let sharedKv: KvStore<unknown> | undefined

function projectKv(): KvStore<unknown> {
  sharedKv ??= createStoreProvider(createScope({ cwd: process.cwd() }), {
    backendFactory: mirkBackendFactory(createScope({ cwd: process.cwd() })),
  }).kv("project", NAMESPACE)
  return sharedKv
}

function isDiscoveredModelCacheEntry(
  value: unknown,
): value is DiscoveredModelCacheEntry {
  if (typeof value !== "object" || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    isNonEmptyString(entry.id) &&
    isNonEmptyString(entry.providerId) &&
    isNonEmptyString(entry.model) &&
    isNonEmptyString(entry.label) &&
    (entry.contextWindowTokens === undefined ||
      (typeof entry.contextWindowTokens === "number" &&
        Number.isFinite(entry.contextWindowTokens) &&
        entry.contextWindowTokens > 0))
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}
