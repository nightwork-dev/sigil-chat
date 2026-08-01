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
