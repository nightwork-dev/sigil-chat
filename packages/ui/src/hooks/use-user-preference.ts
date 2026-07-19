"use client"

import { useCallback, useSyncExternalStore } from "react"

// A single user preference persisted to localStorage — the reusable primitive for
// "remember my choice" settings (sidebar collapsed, panel sizes, view modes…).
//
// - SSR-safe: the server snapshot is `defaultValue`; the client reads localStorage
//   after hydration (via useSyncExternalStore, so no hydration mismatch).
// - Cross-tab: reacts to the `storage` event; same-tab writes notify locally.
// - Stable references: reads are cached by raw string, so object-valued
//   preferences don't thrash useSyncExternalStore.
//
// For cross-DEVICE sync, layer a server mutation on top of the returned setter and
// hydrate `defaultValue` from the server (e.g. a React Query user-settings query);
// this hook is the local, offline-first tier of that story.

const listeners = new Map<string, Set<() => void>>()
const cache = new Map<string, { raw: string | null; value: unknown }>()

function readValue<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    return defaultValue
  }
  const cached = cache.get(key)
  if (cached && cached.raw === raw) return cached.value as T
  let value: T
  try {
    value = raw === null ? defaultValue : (JSON.parse(raw) as T)
  } catch {
    value = defaultValue
  }
  cache.set(key, { raw, value })
  return value
}

function notify(key: string) {
  const set = listeners.get(key)
  if (set) for (const listener of set) listener()
}

export function useUserPreference<T>(
  key: string,
  defaultValue: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let set = listeners.get(key)
      if (!set) {
        set = new Set()
        listeners.set(key, set)
      }
      set.add(onChange)
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) {
          cache.delete(key)
          onChange()
        }
      }
      window.addEventListener("storage", onStorage)
      return () => {
        set?.delete(onChange)
        window.removeEventListener("storage", onStorage)
      }
    },
    [key],
  )

  const value = useSyncExternalStore(
    subscribe,
    () => readValue(key, defaultValue),
    () => defaultValue,
  )

  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      const resolved =
        typeof next === "function"
          ? (next as (previous: T) => T)(readValue(key, defaultValue))
          : next
      try {
        const raw = JSON.stringify(resolved)
        window.localStorage.setItem(key, raw)
        cache.set(key, { raw, value: resolved })
      } catch {
        // Storage unavailable (private mode / quota) — keep it in-memory so the
        // preference still applies for this session.
        cache.set(key, { raw: JSON.stringify(resolved), value: resolved })
      }
      notify(key)
    },
    [key, defaultValue],
  )

  return [value, setValue]
}
