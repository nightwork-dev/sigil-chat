import { useSyncExternalStore } from "react"

/**
 * Read a browser-local value in a way that survives hydration.
 *
 * The server has no localStorage, so a component that reads it during the
 * first client render paints something the server never wrote and React
 * reports a mismatch. `useSyncExternalStore` is the sanctioned answer: React
 * uses the server value for the SSR pass AND the hydration pass, then reads
 * the real one once mounted.
 *
 * There is nothing to subscribe to — the mirror is written from the query
 * layer, and the query is what re-renders on a change — so `subscribe` is a
 * no-op. React still re-reads the snapshot after hydration, which is the
 * whole reason this hook exists.
 *
 * `read` must return a stable reference for object values; React compares
 * snapshots by identity.
 */
const NO_SUBSCRIBERS = () => () => {}

export function useHydratedMirror<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(NO_SUBSCRIBERS, read, () => serverValue)
}
