import { useEffect, useRef, useState } from "react"

interface UseDebouncedValueOptions {
  /** Apply the first change immediately instead of waiting `wait` ms. */
  leading?: boolean
}

/** Debounces a changing value — the returned value lags `wait` ms behind `value`, skipping the debounce on mount. */
export function useDebouncedValue<T>(value: T, wait: number, options: UseDebouncedValueOptions = { leading: false }) {
  const [debounced, setDebounced] = useState(value)
  const mountedRef = useRef(false)
  const timeoutRef = useRef<number | undefined>(undefined)
  const cooldownRef = useRef(false)

  function cancel() {
    window.clearTimeout(timeoutRef.current)
  }

  useEffect(() => {
    if (mountedRef.current) {
      if (!cooldownRef.current && options.leading) {
        cooldownRef.current = true
        setDebounced(value)
      } else {
        cancel()
        timeoutRef.current = window.setTimeout(() => {
          cooldownRef.current = false
          setDebounced(value)
        }, wait)
      }
    }
  }, [value, options.leading, wait])

  useEffect(() => {
    mountedRef.current = true
    return cancel
  }, [])

  return [debounced, cancel] as const
}
