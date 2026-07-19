// Typed application registry for user preferences (S10.4).
//
// This is the single source of truth for which setting keys exist, which
// scopes each may be written at, its validator, and its registered product
// default. The server (server-fns.ts) REJECTS unknown keys and invalid
// values against this registry — it is not advisory.
//
// Pure + dependency-free (no libsql, no server-only imports) so both the
// server store and any client-side code that needs to know a key's shape can
// import it without pulling server-only code into the browser bundle.
//
// This is PREFERENCE resolution only — never an authorization grant. Never
// register a key whose value is a secret, an access/continuation token, a
// role, a membership, or a resource permission (spec: forbidden setting
// values).

export type SettingScopeKind = "user" | "workspace" | "channel"

export interface UserSettingScope {
  kind: SettingScopeKind
  /** Empty string for the singleton "user" scope. */
  id: string
}

export interface UserSettingRecord {
  userId: string
  scopeKind: SettingScopeKind
  scopeId: string
  key: string
  value: unknown
  revision: number
  updatedAt: string
}

export interface SettingDefinition<T = unknown> {
  key: string
  /** Which scope tiers this key may be written at, most- to least-specific. */
  allowedScopes: readonly SettingScopeKind[]
  defaultValue: T
  isValid(value: unknown): value is T
}

function definition<T>(def: SettingDefinition<T>): SettingDefinition<T> {
  return def
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean"
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

const THEME_IDS = [
  "theme-amber",
  "theme-copper",
  "theme-midnight",
  "theme-rose-gold",
  "theme-jade",
  "theme-bone",
  "theme-ultraviolet",
] as const
export type RegisteredThemeId = (typeof THEME_IDS)[number]

const APPEARANCE_MODES = ["light", "dark", "system"] as const
export type RegisteredAppearanceMode = (typeof APPEARANCE_MODES)[number]

const TOOL_APPROVAL_DEFAULTS = ["ask", "always"] as const
export type RegisteredToolApprovalDefault = (typeof TOOL_APPROVAL_DEFAULTS)[number]

function isWorkspacePanelState(value: unknown): value is Record<string, unknown> {
  // Validated workspace-specific object: a plain JSON-serializable record.
  // No workspace UI reads this yet (S10.4 registers the key ahead of the
  // consumer); the shape is intentionally permissive but excludes arrays,
  // null, and primitives so it stays a namespaced bag of fields.
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
}

export const SETTINGS_REGISTRY = {
  "appearance.theme": definition<RegisteredThemeId>({
    key: "appearance.theme",
    allowedScopes: ["user"],
    defaultValue: "theme-amber",
    isValid: (value): value is RegisteredThemeId =>
      typeof value === "string" &&
      (THEME_IDS as readonly string[]).includes(value),
  }),
  "appearance.mode": definition<RegisteredAppearanceMode>({
    key: "appearance.mode",
    allowedScopes: ["user"],
    defaultValue: "system",
    isValid: (value): value is RegisteredAppearanceMode =>
      typeof value === "string" &&
      (APPEARANCE_MODES as readonly string[]).includes(value),
  }),
  "appearance.reducedMotion": definition<boolean>({
    key: "appearance.reducedMotion",
    allowedScopes: ["user"],
    defaultValue: false,
    isValid: isBoolean,
  }),
  "agent.toolApprovalDefault": definition<RegisteredToolApprovalDefault>({
    key: "agent.toolApprovalDefault",
    allowedScopes: ["user"],
    defaultValue: "ask",
    isValid: (value): value is RegisteredToolApprovalDefault =>
      typeof value === "string" &&
      (TOOL_APPROVAL_DEFAULTS as readonly string[]).includes(value),
  }),
  "agent.activeChannelId": definition<string | null>({
    key: "agent.activeChannelId",
    allowedScopes: ["user"],
    defaultValue: null,
    isValid: isNullableString,
  }),
  "workspace.lastChannel": definition<string | null>({
    key: "workspace.lastChannel",
    allowedScopes: ["user"],
    defaultValue: null,
    isValid: isNullableString,
  }),
  "workspace.panelState": definition<Record<string, unknown>>({
    key: "workspace.panelState",
    allowedScopes: ["workspace"],
    defaultValue: {},
    isValid: isWorkspacePanelState,
  }),
} as const satisfies Record<string, SettingDefinition<unknown>>

export type SettingKey = keyof typeof SETTINGS_REGISTRY

export type SettingValue<K extends SettingKey> =
  (typeof SETTINGS_REGISTRY)[K] extends SettingDefinition<infer T> ? T : never

export function isKnownSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_REGISTRY, key)
}

export function getSettingDefinition<K extends SettingKey>(
  key: K,
): (typeof SETTINGS_REGISTRY)[K] {
  return SETTINGS_REGISTRY[key]
}

export function isScopeAllowed(key: SettingKey, scopeKind: SettingScopeKind): boolean {
  return (SETTINGS_REGISTRY[key].allowedScopes as readonly SettingScopeKind[]).includes(
    scopeKind,
  )
}

export function validateSettingValue(key: SettingKey, value: unknown): boolean {
  return SETTINGS_REGISTRY[key].isValid(value)
}
