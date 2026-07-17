import { useSyncExternalStore } from "react"

export type ToolApprovalMode = "ask" | "always"

// Keep in sync with apps/agent/agent/channels/eve.ts. This is a client
// preference header, not a security boundary.
export const TOOL_APPROVAL_HEADER = "x-sigil-tool-approval"

const STORAGE_KEY = "sigil-chat:tool-approval"
const listeners = new Set<() => void>()
let cachedMode: ToolApprovalMode | undefined
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

export function useToolApprovalMode(): ToolApprovalMode {
  return useSyncExternalStore(
    subscribeToolApprovalMode,
    getToolApprovalMode,
    () => "ask",
  )
}

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
  if (event.key !== STORAGE_KEY) return
  cachedMode = parseMode(event.newValue)
  listeners.forEach((registered) => registered())
}

function parseMode(value: string | null): ToolApprovalMode {
  return value === "always" ? "always" : "ask"
}
