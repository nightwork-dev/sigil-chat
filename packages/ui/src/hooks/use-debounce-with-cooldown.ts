import { useCallback, useEffect, useRef } from "react"

/**
 * Debounces `callback`, but executes immediately if `cooldown` ms have
 * passed since the last call. Fixed two real issues from the source
 * (the original hook): `timerId`/`lastCall` lived
 * in state purely for bookkeeping, forcing an extra re-render on every call
 * for no visible-output reason — moved to refs. `callback` was a dependency
 * of the memoized debounced function, so passing an inline (unmemoized)
 * callback regenerated the returned function every render — exactly the
 * kind of stable reference a consumer is expected to pass to their own
 * effect or an event listener (this is the one legitimate case for
 * memoizing a returned callback: it's the hook's entire contract, not
 * incidental to a component render). `callback` is read from a ref updated
 * every render instead, so the returned function stays stable across
 * `wait`/`cooldown` being unchanged.
 */
export function useDebounceWithCooldown(callback: () => void, wait: number, cooldown: number) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback
  const lastCallRef = useRef(0)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => window.clearTimeout(timerRef.current)
  }, [])

  return useCallback(
    () => {
      const now = Date.now()
      const timeSinceLastCall = now - lastCallRef.current

      window.clearTimeout(timerRef.current)

      if (timeSinceLastCall >= cooldown) {
        callbackRef.current()
        lastCallRef.current = now
        return
      }

      timerRef.current = window.setTimeout(() => {
        callbackRef.current()
        lastCallRef.current = Date.now()
      }, wait)
    },
    [wait, cooldown]
  )
}
