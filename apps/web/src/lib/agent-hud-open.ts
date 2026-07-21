import { useSyncExternalStore } from "react"

// The agent HUD's open/closed state, hoisted out of ShellAgentHud's local
// useState into a module-level store so OTHER surfaces (the omnibar's message
// mode) can open the panel after sending a message. Same external-store
// pattern as agent-hud-dock.ts (dock-SIDE): module cache + storage event so
// every mounted ShellAgentHud and other tabs stay in sync.
//
// The HUD reads this via useAgentHudOpen(); a caller sends-and-opens via
// openAgentHud(). The state is ephemeral (not persisted across reload) — it
// represents "is the panel showing right now," not a preference.

const listeners = new Set<() => void>()
let open = false

export function getAgentHudOpen(): boolean {
  return open
}

export function setAgentHudOpen(next: boolean): void {
  if (next === open) return
  open = next
  listeners.forEach((listener) => listener())
}

/** Convenience: open the HUD (used by omnibar message mode after a send). */
export function openAgentHud(): void {
  setAgentHudOpen(true)
}

export function useAgentHudOpen(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getAgentHudOpen,
    () => false,
  )
  return [value, setAgentHudOpen]
}
