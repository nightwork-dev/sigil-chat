import { useSyncExternalStore } from "react"

import type { FloatingDockSide } from "@workspace/ui/components/floating-dock"

export type AgentHudDock = FloatingDockSide | null

// Persists which edge (if any) the agent HUD is docked to, per user/browser.
// Same pattern as agent-tool-approval.ts: module-level cache + storage event
// so every mounted ShellAgentHud instance (and other tabs) stays in sync.
const STORAGE_KEY = "sigil.hud.dock"
const listeners = new Set<() => void>()
let cachedDock: AgentHudDock | undefined
let listeningForStorage = false

export function getAgentHudDock(): AgentHudDock {
  if (typeof window === "undefined") return null
  if (cachedDock === undefined)
    cachedDock = parseDock(window.localStorage.getItem(STORAGE_KEY))
  return cachedDock
}

export function setAgentHudDock(dock: AgentHudDock): void {
  cachedDock = dock
  if (typeof window !== "undefined") {
    if (dock) window.localStorage.setItem(STORAGE_KEY, dock)
    else window.localStorage.removeItem(STORAGE_KEY)
  }
  listeners.forEach((listener) => listener())
}

export function useAgentHudDock(): AgentHudDock {
  return useSyncExternalStore(subscribeAgentHudDock, getAgentHudDock, () => null)
}

export function subscribeAgentHudDock(listener: () => void): () => void {
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
  cachedDock = parseDock(event.newValue)
  listeners.forEach((registered) => registered())
}

function parseDock(value: string | null): AgentHudDock {
  return value === "left" || value === "right" ? value : null
}
