import { useSyncExternalStore } from "react"

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
const listeners = new Set<() => void>()
let cachedMode: ToolApprovalMode | undefined
let cachedOverrides: PerAgentToolApprovalOverrides | undefined
let listeningForStorage = false

export function getToolApprovalMode(): ToolApprovalMode {
  if (typeof window === "undefined") return "ask"
  if (cachedMode === undefined)
    cachedMode = parseMode(window.localStorage.getItem(STORAGE_KEY))
  return cachedMode
}

export function setToolApprovalMode(mode: ToolApprovalMode): void {
  cachedMode = mode
  if (typeof window !== "undefined")
    window.localStorage.setItem(STORAGE_KEY, mode)
  listeners.forEach((listener) => listener())
}

export function getToolApprovalOverrides(): PerAgentToolApprovalOverrides {
  if (typeof window === "undefined") return {}
  if (cachedOverrides === undefined) {
    cachedOverrides = parseOverrides(
      window.localStorage.getItem(OVERRIDES_STORAGE_KEY),
    )
  }
  return cachedOverrides
}

export function setToolApprovalOverrides(
  overrides: PerAgentToolApprovalOverrides,
): void {
  cachedOverrides = normalizePerAgentOverrides(overrides)
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      OVERRIDES_STORAGE_KEY,
      JSON.stringify(cachedOverrides),
    )
  }
  listeners.forEach((listener) => listener())
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
    entries.length > 0 && entries.every(([, layer]) => typeof layer === "string")
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

export function getToolApprovalHeaderValue(): string {
  // The header carries the account-wide view: today Eve is the only
  // interactive agent and the settings surface writes only "*". When the
  // multi-agent track lands, the session layer passes its agent name here.
  return serializeToolApprovalPreference(
    getToolApprovalMode(),
    effectiveToolApprovalOverrides(getToolApprovalOverrides()),
  )
}

export function serializeToolApprovalPreference(
  defaultMode: ToolApprovalMode,
  overrides: ToolApprovalOverrides,
): string {
  return Object.keys(overrides).length === 0
    ? defaultMode
    : JSON.stringify({ default: defaultMode, tools: overrides })
}

export function useToolApprovalMode(): ToolApprovalMode {
  return useSyncExternalStore(
    subscribeToolApprovalMode,
    getToolApprovalMode,
    () => "ask",
  )
}

export function useToolApprovalOverrides(): PerAgentToolApprovalOverrides {
  return useSyncExternalStore(
    subscribeToolApprovalMode,
    getToolApprovalOverrides,
    () => EMPTY_OVERRIDES,
  )
}

const EMPTY_OVERRIDES: PerAgentToolApprovalOverrides = {}

export function subscribeToolApprovalMode(listener: () => void): () => void {
  listeners.add(listener)
  if (typeof window !== "undefined" && !listeningForStorage) {
    window.addEventListener("storage", handleStorage)
    listeningForStorage = true
  }
  return () => {
    listeners.delete(listener)
    if (
      typeof window !== "undefined" &&
      listeningForStorage &&
      listeners.size === 0
    ) {
      window.removeEventListener("storage", handleStorage)
      listeningForStorage = false
    }
  }
}

function handleStorage(event: StorageEvent): void {
  if (event.key === STORAGE_KEY) cachedMode = parseMode(event.newValue)
  else if (event.key === OVERRIDES_STORAGE_KEY) {
    cachedOverrides = parseOverrides(event.newValue)
  } else return
  listeners.forEach((registered) => registered())
}

function parseMode(value: string | null): ToolApprovalMode {
  return value === "always" ? "always" : "ask"
}

function parseOverrides(value: string | null): PerAgentToolApprovalOverrides {
  if (!value) return {}
  try {
    return normalizePerAgentOverrides(JSON.parse(value))
  } catch {
    return {}
  }
}
