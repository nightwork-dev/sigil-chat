// The "speak replies" preference, as a synchronous client store.
//
// Same shape and same reason as `agent-tool-approval`: the chat surface needs
// this value during render, on every route, without a userId in hand or a
// query in flight — so localStorage is the fast local mirror, and Settings →
// Agent writes it through to the registry-backed `agent.speakReplies` so it
// survives a new browser. The registry is the durable copy; this is the one
// the composer reads.
//
// Default is OFF. A page that starts talking on load is a page nobody asked to
// talk.

import { useSyncExternalStore } from "react"

const STORAGE_KEY = "sigil-chat:speak-replies"
const listeners = new Set<() => void>()
let cached: boolean | undefined
let listeningForStorage = false

export function getSpeakReplies(): boolean {
  if (typeof window === "undefined") return false
  if (cached === undefined) cached = parse(window.localStorage.getItem(STORAGE_KEY))
  return cached
}

export function setSpeakReplies(enabled: boolean): void {
  cached = enabled
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off")
  }
  listeners.forEach((listener) => listener())
}

export function useSpeakReplies(): boolean {
  return useSyncExternalStore(subscribeSpeakReplies, getSpeakReplies, () => false)
}

export function subscribeSpeakReplies(listener: () => void): () => void {
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
  cached = parse(event.newValue)
  listeners.forEach((listener) => listener())
}

/** Anything that is not an explicit "on" is off — an unparseable or absent
 *  value must never resolve to "start speaking". */
function parse(value: string | null): boolean {
  return value === "on"
}
