import { useSyncExternalStore } from "react"

export type ToolApprovalMode = "ask" | "always"
export type ToolApprovalOverrides = Record<string, ToolApprovalMode>

// Keep in sync with apps/agent/agent/channels/eve.ts. This is a client
// preference header, not a security boundary.
export const TOOL_APPROVAL_HEADER = "x-sigil-tool-approval"

const STORAGE_KEY = "sigil-chat:tool-approval"
const OVERRIDES_STORAGE_KEY = "sigil-chat:tool-approval-overrides"
const MAX_TOOL_APPROVAL_OVERRIDES = 64
const MAX_TOOL_NAME_LENGTH = 160
const listeners = new Set<() => void>()
let cachedMode: ToolApprovalMode | undefined
let cachedOverrides: ToolApprovalOverrides | undefined
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

export function getToolApprovalOverrides(): ToolApprovalOverrides {
  if (typeof window === "undefined") return {}
  if (cachedOverrides === undefined) {
    cachedOverrides = parseOverrides(
      window.localStorage.getItem(OVERRIDES_STORAGE_KEY),
    )
  }
  return cachedOverrides
}

export function setToolApprovalOverrides(overrides: ToolApprovalOverrides): void {
  cachedOverrides = { ...overrides }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      OVERRIDES_STORAGE_KEY,
      JSON.stringify(cachedOverrides),
    )
  }
  listeners.forEach((listener) => listener())
}

export function getToolApprovalHeaderValue(): string {
  return serializeToolApprovalPreference(
    getToolApprovalMode(),
    getToolApprovalOverrides(),
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

export function useToolApprovalOverrides(): ToolApprovalOverrides {
  return useSyncExternalStore(
    subscribeToolApprovalMode,
    getToolApprovalOverrides,
    () => EMPTY_OVERRIDES,
  )
}

const EMPTY_OVERRIDES: ToolApprovalOverrides = {}

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

function parseOverrides(value: string | null): ToolApprovalOverrides {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed).slice(0, MAX_TOOL_APPROVAL_OVERRIDES).filter(
        ([toolName, mode]) =>
          toolName.length > 0 &&
          toolName.length <= MAX_TOOL_NAME_LENGTH &&
          (mode === "ask" || mode === "always"),
      ),
    )
  } catch {
    return {}
  }
}
