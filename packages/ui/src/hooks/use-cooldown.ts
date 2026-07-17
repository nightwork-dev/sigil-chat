import { useEffect, useRef, useState } from "react"

/**
 * Triggers `fn` once after `delay` ms of being active. Fixed a real bug from
 * the source: `fn` was a direct effect dependency, so a consumer passing an inline
 * (unmemoized) callback caused the effect to clear and reschedule the
 * timeout on every re-render while active — the cooldown could never
 * actually fire. `fn` is now kept in a ref instead, matching the sibling
 * `useInterval` hook's own (already-correct) pattern.
 */
export function useCooldown(delay = 20, fn: () => void = () => {}, autoInvoke = false) {
  const [cooldown, setCooldown] = useState(delay)
  const [active, setActive] = useState(autoInvoke)
  const timeoutRef = useRef<number | undefined>(undefined)
  const fnRef = useRef(fn)
  fnRef.current = fn

  function start() {
    setActive(true)
  }

  function clear() {
    setActive(false)
    window.clearTimeout(timeoutRef.current)
  }

  useEffect(() => {
    if (active) {
      timeoutRef.current = window.setTimeout(() => {
        fnRef.current()
        setActive(false)
      }, cooldown)
    }
    return () => window.clearTimeout(timeoutRef.current)
  }, [active, cooldown])

  return { start, clear, active, set: setCooldown }
}
