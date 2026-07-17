import { useEffect, useRef, useState } from "react"

/**
 * Start/stop/toggle-able `setInterval`. The callback lives in a ref assigned
 * in the render body — NOT in a `[fn]`-keyed effect — so an inline
 * (unmemoized) callback can't tear down the live interval on every render
 * (same pattern as useCooldown). The only effect is clear-on-unmount.
 */
export function useInterval(interval: number, fn?: () => void) {
  const [active, setActive] = useState(false)
  const intervalRef = useRef<number | undefined>(undefined)
  const fnRef = useRef<(() => void) | undefined>(undefined)
  fnRef.current = fn

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [])

  function start() {
    setActive((old) => {
      if (!old && !intervalRef.current && fnRef.current) {
        intervalRef.current = window.setInterval(fnRef.current, interval)
      }
      return true
    })
  }

  function stop() {
    setActive(false)
    window.clearInterval(intervalRef.current)
    intervalRef.current = undefined
  }

  function toggle() {
    if (active) stop()
    else start()
  }

  return { start, stop, toggle, active }
}
