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

/**
 * The semantic scope vocabulary used by SC.4 resolution. This deliberately
 * stays separate from `SettingScopeKind`: the latter is the shape of the
 * existing `user_settings` table and server-function API, while this one is
 * the scope-composition contract new resource families resolve against.
 */
export type SettingResolutionScopeKind =
  | "installation"
  | "organization"
  | "project"
  | "workspace"
  | "session"
  | "personal"

export type SettingContributingLinkKind =
  "mounted-in" | "contributes-defaults" | "rolls-up-to" | "discoverable-from"

export interface NamedSettingResolver<T> {
  readonly kind: "named"
  readonly name: string
  resolve(input: {
    readonly defaultValue: T
    readonly contributions: readonly T[]
  }): T
}

export type SettingMergeMode<T> =
  "replace" | "deep-merge" | "set-union" | NamedSettingResolver<T>

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
  /** Which SC.4 scope kinds may contribute during semantic resolution. */
  allowedScopeKinds: readonly SettingResolutionScopeKind[]
  /** Composition relations this setting expressly permits as contributors. */
  allowedContributingLinkKinds: readonly SettingContributingLinkKind[]
  mergeMode: SettingMergeMode<T>
  /** Whether a record in the current principal's personal scope may contribute. */
  allowsPersonalOverride: boolean
  /** Security/authorization settings receive the stricter resolver guardrails. */
  affectsSecurity: boolean
  defaultValue: T
  isValid(value: unknown): value is T
}

export function defineSetting<T>(def: SettingDefinition<T>): SettingDefinition<T> {
  if (
    def.affectsSecurity &&
    (def.allowsPersonalOverride ||
      def.allowedScopeKinds.includes("personal") ||
      def.allowedContributingLinkKinds.length > 0)
  ) {
    throw new Error(
      `Security setting "${def.key}" cannot permit personal or linked contributions.`,
    )
  }
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
const MAX_TOOL_APPROVAL_OVERRIDES = 64
const MAX_TOOL_NAME_LENGTH = 160
export type RegisteredToolApprovalDefault = (typeof TOOL_APPROVAL_DEFAULTS)[number]
export type RegisteredToolApprovalOverrides = Record<
  string,
  RegisteredToolApprovalDefault
>

function isToolApprovalOverrides(
  value: unknown,
): value is RegisteredToolApprovalOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const entries = Object.entries(value)
  return (
    entries.length <= MAX_TOOL_APPROVAL_OVERRIDES &&
    entries.every(
      ([toolName, mode]) =>
        toolName.length > 0 &&
        toolName.length <= MAX_TOOL_NAME_LENGTH &&
        (TOOL_APPROVAL_DEFAULTS as readonly unknown[]).includes(mode),
    )
  )
}

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
  "appearance.theme": defineSetting<RegisteredThemeId>({
    key: "appearance.theme",
    allowedScopes: ["user"],
    allowedScopeKinds: [
      "installation",
      "organization",
      "project",
      "workspace",
      "session",
      "personal",
    ],
    allowedContributingLinkKinds: ["contributes-defaults"],
    mergeMode: "replace",
    allowsPersonalOverride: true,
    affectsSecurity: false,
    defaultValue: "theme-amber",
    isValid: (value): value is RegisteredThemeId =>
      typeof value === "string" &&
      (THEME_IDS as readonly string[]).includes(value),
  }),
  "appearance.mode": defineSetting<RegisteredAppearanceMode>({
    key: "appearance.mode",
    allowedScopes: ["user"],
    allowedScopeKinds: [
      "installation",
      "organization",
      "project",
      "workspace",
      "session",
      "personal",
    ],
    allowedContributingLinkKinds: ["contributes-defaults"],
    mergeMode: "replace",
    allowsPersonalOverride: true,
    affectsSecurity: false,
    defaultValue: "system",
    isValid: (value): value is RegisteredAppearanceMode =>
      typeof value === "string" &&
      (APPEARANCE_MODES as readonly string[]).includes(value),
  }),
  "appearance.reducedMotion": defineSetting<boolean>({
    key: "appearance.reducedMotion",
    allowedScopes: ["user"],
    allowedScopeKinds: [
      "installation",
      "organization",
      "project",
      "workspace",
      "session",
      "personal",
    ],
    allowedContributingLinkKinds: ["contributes-defaults"],
    mergeMode: "replace",
    allowsPersonalOverride: true,
    affectsSecurity: false,
    defaultValue: false,
    isValid: isBoolean,
  }),
  "agent.toolApprovalDefault": defineSetting<RegisteredToolApprovalDefault>({
    key: "agent.toolApprovalDefault",
    allowedScopes: ["user"],
    allowedScopeKinds: [
      "installation",
      "organization",
      "project",
      "workspace",
      "session",
      "personal",
    ],
    allowedContributingLinkKinds: ["contributes-defaults"],
    mergeMode: "replace",
    // This controls client prompting only; invocation authorization is a
    // separate host boundary (SC.4 §8.3).
    allowsPersonalOverride: true,
    affectsSecurity: false,
    defaultValue: "ask",
    isValid: (value): value is RegisteredToolApprovalDefault =>
      typeof value === "string" &&
      (TOOL_APPROVAL_DEFAULTS as readonly string[]).includes(value),
  }),
  "agent.toolApprovalOverrides": defineSetting<RegisteredToolApprovalOverrides>(
    {
      key: "agent.toolApprovalOverrides",
      allowedScopes: ["user"],
      allowedScopeKinds: [
        "installation",
        "organization",
        "project",
        "workspace",
        "session",
        "personal",
      ],
      allowedContributingLinkKinds: ["contributes-defaults"],
      mergeMode: "deep-merge",
      allowsPersonalOverride: true,
      affectsSecurity: false,
      defaultValue: {},
      isValid: isToolApprovalOverrides,
    },
  ),
  "agent.activeChannelId": defineSetting<string | null>({
    key: "agent.activeChannelId",
    allowedScopes: ["user"],
    allowedScopeKinds: ["personal"],
    allowedContributingLinkKinds: [],
    mergeMode: "replace",
    allowsPersonalOverride: true,
    affectsSecurity: false,
    defaultValue: null,
    isValid: isNullableString,
  }),
  "workspace.lastChannel": defineSetting<string | null>({
    key: "workspace.lastChannel",
    allowedScopes: ["user"],
    allowedScopeKinds: ["personal"],
    allowedContributingLinkKinds: [],
    mergeMode: "replace",
    allowsPersonalOverride: true,
    affectsSecurity: false,
    defaultValue: null,
    isValid: isNullableString,
  }),
  "workspace.panelState": defineSetting<Record<string, unknown>>({
    key: "workspace.panelState",
    allowedScopes: ["workspace"],
    allowedScopeKinds: ["workspace"],
    allowedContributingLinkKinds: [],
    mergeMode: "deep-merge",
    allowsPersonalOverride: false,
    affectsSecurity: false,
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
