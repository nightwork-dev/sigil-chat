// The tool-approval preference's contract: its wire format, its layering
// rules, and the browser-local mirror the app can read before a query has
// resolved.
//
// The preference itself lives in the user-settings registry — see
// ./agent-preferences for the hooks that read and write it. What is left here
// is everything that must work without React: the header name and its
// serialization (Eve parses this exact shape), the MA.4 layer resolution, and
// the localStorage mirror.
//
// The mirror is a mirror and nothing more. It is written from the query layer
// and read only before that layer has an answer — first paint, and the moment
// after hydration. It has no listeners and no subscribers, because a second
// set of writers is how the durable value and the local one drifted apart.

export type ToolApprovalMode = "ask" | "always"
/** One agent's layer: tool id → mode. */
export type ToolApprovalOverrides = Record<string, ToolApprovalMode>
/**
 * Layered per-agent consent (MA.4): agent name → that agent's tool overrides,
 * with `"*"` as the account-wide layer. Resolution is account default →
 * `"*"` layer → named-agent layer; `effectiveToolApprovalOverrides` computes
 * the merged view. Until the multi-agent track ships a second interactive
 * agent, the settings surface reads and writes only `"*"`.
 */
export type PerAgentToolApprovalOverrides = Record<
  string,
  ToolApprovalOverrides
>

export const ACCOUNT_WIDE_AGENT_KEY = "*"

// Keep in sync with apps/agent/agent/channels/eve.ts. This is a client
// preference header, not a security boundary.
export const TOOL_APPROVAL_HEADER = "x-sigil-tool-approval"

const STORAGE_KEY = "sigil-chat:tool-approval"
const OVERRIDES_STORAGE_KEY = "sigil-chat:tool-approval-overrides"
const MAX_TOOL_APPROVAL_AGENTS = 16
const MAX_TOOL_APPROVAL_OVERRIDES = 64
const MAX_TOOL_NAME_LENGTH = 160

export const EMPTY_TOOL_APPROVAL_OVERRIDES: PerAgentToolApprovalOverrides = {}

// Parsed once per browser session and refreshed on write. Referential
// stability matters: the mirror is read through useSyncExternalStore, which
// compares snapshots by identity.
let cachedMode: ToolApprovalMode | undefined
let cachedOverrides: PerAgentToolApprovalOverrides | undefined

export function readToolApprovalModeMirror(): ToolApprovalMode {
  if (typeof window === "undefined") return "ask"
  if (cachedMode === undefined) {
    cachedMode = parseMode(window.localStorage.getItem(STORAGE_KEY))
  }
  return cachedMode
}

export function writeToolApprovalModeMirror(mode: ToolApprovalMode): void {
  cachedMode = mode
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, mode)
  }
}

export function readToolApprovalOverridesMirror(): PerAgentToolApprovalOverrides {
  if (typeof window === "undefined") return EMPTY_TOOL_APPROVAL_OVERRIDES
  if (cachedOverrides === undefined) {
    cachedOverrides = parseOverrides(
      window.localStorage.getItem(OVERRIDES_STORAGE_KEY),
    )
  }
  return cachedOverrides
}

export function writeToolApprovalOverridesMirror(
  overrides: PerAgentToolApprovalOverrides,
): void {
  cachedOverrides = normalizePerAgentOverrides(overrides)
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      OVERRIDES_STORAGE_KEY,
      JSON.stringify(cachedOverrides),
    )
  }
}

/**
 * The overrides in force for one agent: the account-wide `"*"` layer with the
 * named agent's layer on top. Omit the agent name for the account-wide view.
 */
export function effectiveToolApprovalOverrides(
  overrides: PerAgentToolApprovalOverrides,
  agentName?: string,
): ToolApprovalOverrides {
  const star = overrides[ACCOUNT_WIDE_AGENT_KEY] ?? {}
  if (!agentName || agentName === ACCOUNT_WIDE_AGENT_KEY) return star
  return { ...star, ...(overrides[agentName] ?? {}) }
}

/**
 * Accept both the MA.4 per-agent shape and the legacy flat map (tool id →
 * mode), migrating the latter into the `"*"` layer. Anything else is dropped.
 */
export function normalizePerAgentOverrides(
  value: unknown,
): PerAgentToolApprovalOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }
  const entries = Object.entries(value)
  // Legacy flat map: EVERY value is a mode string (same rule as the settings
  // registry validator). A mixed object takes the nested path, where string
  // layers are malformed and dropped.
  const isLegacyFlat =
    entries.length > 0 &&
    entries.every(([, layer]) => typeof layer === "string")
  if (isLegacyFlat) {
    const star = normalizeLayer(value)
    return Object.keys(star).length > 0
      ? { [ACCOUNT_WIDE_AGENT_KEY]: star }
      : {}
  }
  const result: PerAgentToolApprovalOverrides = {}
  for (const [agentKey, layer] of entries.slice(0, MAX_TOOL_APPROVAL_AGENTS)) {
    if (agentKey.length === 0 || agentKey.length > MAX_TOOL_NAME_LENGTH) {
      continue
    }
    const normalized = normalizeLayer(layer)
    if (Object.keys(normalized).length > 0) result[agentKey] = normalized
  }
  return result
}

function normalizeLayer(value: unknown): ToolApprovalOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_TOOL_APPROVAL_OVERRIDES)
      .filter(
        ([toolName, mode]) =>
          toolName.length > 0 &&
          toolName.length <= MAX_TOOL_NAME_LENGTH &&
          (mode === "ask" || mode === "always"),
      ),
  ) as ToolApprovalOverrides
}

export function serializeToolApprovalPreference(
  defaultMode: ToolApprovalMode,
  overrides: ToolApprovalOverrides,
): string {
  return Object.keys(overrides).length === 0
    ? defaultMode
    : JSON.stringify({ default: defaultMode, tools: overrides })
}

export function parseToolApprovalMode(value: unknown): ToolApprovalMode {
  return value === "always" ? "always" : "ask"
}

function parseMode(value: string | null): ToolApprovalMode {
  return parseToolApprovalMode(value)
}

function parseOverrides(value: string | null): PerAgentToolApprovalOverrides {
  if (!value) return EMPTY_TOOL_APPROVAL_OVERRIDES
  try {
    return normalizePerAgentOverrides(JSON.parse(value))
  } catch {
    return EMPTY_TOOL_APPROVAL_OVERRIDES
  }
}
