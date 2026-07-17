import { useCallback, useEffect, useRef, useState } from "react"

interface UseDebouncedStateOptions {
  /** Apply the first set immediately instead of waiting `wait` ms. */
  leading?: boolean
}

/**
 * A debounced `useState` — `setValue` schedules the update instead of
 * applying it immediately. Fixed a real bug from the source
 * (the original hook): `wait` was read inside the
 * memoized setter but wasn't in its dependency array (suppressed with an
 * eslint-disable) — if `wait` changed after mount, the setter kept using
 * the stale value from whenever `options.leading` last changed. `wait` is
 * now a real dependency.
 */
export function useDebouncedState<T>(defaultValue: T, wait: number, options: UseDebouncedStateOptions = { leading: false }) {
  const [value, setValue] = useState(defaultValue)
  const timeoutRef = useRef<number | undefined>(undefined)
  const leadingRef = useRef(true)

  useEffect(() => {
    return () => window.clearTimeout(timeoutRef.current)
  }, [])

  const debouncedSetValue = useCallback(
    (newValue: T) => {
      window.clearTimeout(timeoutRef.current)
      if (leadingRef.current && options.leading) {
        setValue(newValue)
      } else {
        timeoutRef.current = window.setTimeout(() => {
          leadingRef.current = true
          setValue(newValue)
        }, wait)
      }
      leadingRef.current = false
    },
    [options.leading, wait]
  )

  return [value, debouncedSetValue] as const
}
