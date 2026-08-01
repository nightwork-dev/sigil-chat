// Typed registry for INSTALLATION-scoped settings (MDL.2).
//
// A separate tier from ./user-settings/registry.ts, and separate on purpose.
// A user-scoped record answers "what does this person prefer"; an
// installation-scoped record answers "what does this deployment permit". The
// model allow-list is the second kind — a per-user enabled set would let any
// member enable an expensive model for themselves, which is exactly the
// failure the allow-list exists to prevent (David, 2026-07-31: "RBAC
// eventually. But installation settings").
//
// The tier has two consumers by design: model enablement (built) and feature
// flags (FLAG.1, not built). A flag lands by adding a `flags.*` definition
// below — the store, the owner-gated write path, and the any-principal read
// path do not move.
//
// Pure + dependency-free so the same key names and validators can be imported
// by client code without pulling the server store into the browser bundle.
//
// Values here are DEPLOYMENT POLICY, never a secret: never register a key
// whose value is a credential, a token, or a per-principal grant. Policy is
// readable by every principal (the server evaluates it for everyone) and
// writable only by the owner.

export interface InstallationSettingDefinition<T = unknown> {
  key: string
  /** What an installation that has never written this key resolves to. */
  defaultValue: T
  isValid(value: unknown): value is T
}

export function defineInstallationSetting<T>(
  definition: InstallationSettingDefinition<T>,
): InstallationSettingDefinition<T> {
  return definition
}

/**
 * `<providerId>/<modelId>`, or a reserved single-segment id. Same grammar the
 * fixture mints ids with and the same one `agent.modelPresetId` validates
 * against, so an id that cannot exist is refused before it is ever stored.
 */
const MODEL_PRESET_ID =
  /^[a-z][a-z0-9]*(-[a-z0-9]+)*(\/[a-z][a-z0-9]*(-[a-z0-9]+)*)?$/

const MAX_ENABLED_MODELS = 256
const MAX_MODEL_PRESET_ID_LENGTH = 129

function isModelPresetIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ENABLED_MODELS &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.length <= MAX_MODEL_PRESET_ID_LENGTH &&
        MODEL_PRESET_ID.test(entry),
    ) &&
    new Set(value).size === value.length
  )
}

/** The one key the model allow-list uses. Exported so callers never spell it. */
export const ENABLED_MODELS_KEY = "models.enabled"

/**
 * `provider/model`, matching MODEL_PRESET_ID's compound form ONLY — a
 * discovered entry always names a provider it hangs off of, never the
 * single-segment reserved deployment-default id.
 */
const DISCOVERED_MODEL_ID =
  /^[a-z][a-z0-9]*(-[a-z0-9]+)*\/[a-z][a-z0-9]*(-[a-z0-9]+)*$/

const MAX_DISCOVERED_MODELS = 256
const MAX_DISCOVERED_LABEL_LENGTH = 200
const MAX_DISCOVERED_MODEL_STRING_LENGTH = 200

/**
 * One row of MDL.2's discovery cache (../discovered-models.server.ts): a
 * model Eve's live catalog fetch reported that the fixture did not author.
 *
 * Deliberately thin — no `baseUrl`/`apiKeyEnv`/credential of any kind. Those
 * belong to the PROVIDER, which is already authored in the fixture;
 * `providerId` is how a consumer looks the rest up rather than a second copy
 * drifting out of sync with it.
 */
export interface DiscoveredModelRecord {
  /** `<providerId>/<slug>` — same grammar `models.enabled` validates. */
  id: string
  providerId: string
  /** The raw model string Eve's catalog fetch reported, sent to the API as-is. */
  model: string
  label: string
  contextWindowTokens?: number
}

function isDiscoveredModelRecord(value: unknown): value is DiscoveredModelRecord {
  if (typeof value !== "object" || value === null) return false
  const entry = value as Record<string, unknown>
  if (typeof entry.id !== "string" || !DISCOVERED_MODEL_ID.test(entry.id)) {
    return false
  }
  if (
    typeof entry.providerId !== "string" ||
    entry.providerId.length === 0 ||
    entry.providerId.length > MAX_MODEL_PRESET_ID_LENGTH
  ) {
    return false
  }
  if (!entry.id.startsWith(`${entry.providerId}/`)) return false
  if (
    typeof entry.model !== "string" ||
    entry.model.length === 0 ||
    entry.model.length > MAX_DISCOVERED_MODEL_STRING_LENGTH
  ) {
    return false
  }
  if (
    typeof entry.label !== "string" ||
    entry.label.length === 0 ||
    entry.label.length > MAX_DISCOVERED_LABEL_LENGTH
  ) {
    return false
  }
  if (
    entry.contextWindowTokens !== undefined &&
    (typeof entry.contextWindowTokens !== "number" ||
      !Number.isFinite(entry.contextWindowTokens) ||
      entry.contextWindowTokens <= 0)
  ) {
    return false
  }
  const allowedKeys = new Set([
    "id",
    "providerId",
    "model",
    "label",
    "contextWindowTokens",
  ])
  return Object.keys(entry).every((key) => allowedKeys.has(key))
}

function isDiscoveredModelList(value: unknown): value is DiscoveredModelRecord[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_DISCOVERED_MODELS &&
    value.every(isDiscoveredModelRecord) &&
    new Set(value.map((entry) => (entry as DiscoveredModelRecord).id)).size ===
      value.length
  )
}

/**
 * Cache of models Eve's live catalog fetch has reported that the fixture did
 * not author (MDL.2). Written only by ../discovered-models.server.ts as a
 * side effect of the owner viewing Settings → Models; read by the
 * create-time allow-list gate so a discovered-and-enabled model resolves
 * without a synchronous network call.
 */
export const DISCOVERED_MODELS_KEY = "models.discovered"

const MAX_FEATURE_FLAG_OVERRIDES = 256
const MAX_FEATURE_FLAG_ID_LENGTH = 128

/**
 * `{ [declaredFlagId]: boolean }`. This is the SECOND consumer promised in
 * the file header — one key for every flag, ever, rather than a new store key
 * per flag. Adding a flag means adding a declaration to
 * `../feature-flags/registry.ts`; this key, the store, and the owner-gated
 * write path do not move.
 *
 * Validated generically (string keys, boolean values, bounded size) rather
 * than against the live flag catalog: that keeps this file dependency-free of
 * ../feature-flags/registry.ts, and a stale key here is already harmless —
 * `isFeatureFlagEnabled` in ../feature-flags.ts treats an undeclared id as
 * default-off regardless of what a stored override map says about it.
 */
function isFeatureFlagOverrideMap(value: unknown): value is Record<string, boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const entries = Object.entries(value)
  return (
    entries.length <= MAX_FEATURE_FLAG_OVERRIDES &&
    entries.every(
      ([key, entryValue]) =>
        key.length > 0 &&
        key.length <= MAX_FEATURE_FLAG_ID_LENGTH &&
        typeof entryValue === "boolean",
    )
  )
}

/** The one key every declared feature flag's override lives under. */
export const FEATURE_FLAG_OVERRIDES_KEY = "flags.overrides"

export const INSTALLATION_SETTINGS_REGISTRY = {
  // The explicitly-ENABLED set of model preset ids. Anything absent from it is
  // unselectable — including a provider the fixture authors and a model a
  // future catalog discovers. An empty set is the correct bootstrap state: the
  // deployment default stays reachable through the policy in
  // ../model-enablement.ts, not through a seeded record here.
  [ENABLED_MODELS_KEY]: defineInstallationSetting<string[]>({
    key: ENABLED_MODELS_KEY,
    defaultValue: [],
    isValid: isModelPresetIdList,
  }),
  [DISCOVERED_MODELS_KEY]: defineInstallationSetting<DiscoveredModelRecord[]>({
    key: DISCOVERED_MODELS_KEY,
    defaultValue: [],
    isValid: isDiscoveredModelList,
  }),
  // Per-flag overrides away from each flag's authored default (FLAG.1). An
  // empty map is the correct bootstrap state: every declared flag reads its
  // own registered default until an owner overrides it.
  [FEATURE_FLAG_OVERRIDES_KEY]: defineInstallationSetting<Record<string, boolean>>({
    key: FEATURE_FLAG_OVERRIDES_KEY,
    defaultValue: {},
    isValid: isFeatureFlagOverrideMap,
  }),
} as const satisfies Record<string, InstallationSettingDefinition<unknown>>

export type InstallationSettingKey = keyof typeof INSTALLATION_SETTINGS_REGISTRY

export type InstallationSettingValue<K extends InstallationSettingKey> =
  (typeof INSTALLATION_SETTINGS_REGISTRY)[K] extends InstallationSettingDefinition<
    infer T
  >
    ? T
    : never

export function isKnownInstallationSettingKey(
  key: string,
): key is InstallationSettingKey {
  return Object.prototype.hasOwnProperty.call(
    INSTALLATION_SETTINGS_REGISTRY,
    key,
  )
}

export function getInstallationSettingDefinition<
  K extends InstallationSettingKey,
>(key: K): InstallationSettingDefinition<InstallationSettingValue<K>> {
  return INSTALLATION_SETTINGS_REGISTRY[
    key
  ] as InstallationSettingDefinition<InstallationSettingValue<K>>
}
