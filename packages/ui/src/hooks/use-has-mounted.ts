import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/**
 * True only after the client has taken over from SSR. Prefer fixing the
 * actual cause of an SSR/client mismatch (e.g. seed random values instead
 * of calling Math.random() in render) — reach for this only when the
 * mismatch is coming from something you can't make deterministic, like a
 * third-party library's own internal id counter (see tree-view.tsx's
 * DndContext gate). Implemented with useSyncExternalStore rather than a
 * useState+useEffect pair, per this repo's convention for external-store-
 * style signals — the "external store" here is simply "are we past
 * hydration," which never changes once true, so subscribe is a no-op.
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
