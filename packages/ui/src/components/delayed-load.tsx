"use client"

// Genuinely reuses the (now-fixed) useCooldown
// hook, same as the source — not reinventing the timer logic inline.
// Dropped the source's two console.log mount/unmount lines (debug leftover,
// not this component's job to log). `onLoad`'s useCallback is legitimate
// here: it's the callback useCooldown's own effect depends on.

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useCooldown } from "@workspace/ui/hooks/use-cooldown"

interface DelayedLoadProps {
  children: ReactNode
  fallback?: ReactNode
  /** Delay in ms before `children` renders (default: 5000). */
  delay?: number
  onLoad?: () => void
}

function DelayedLoad({ children, fallback = null, delay = 5000, onLoad }: DelayedLoadProps) {
  const [loaded, setLoaded] = useState(false)

  const handleLoad = useCallback(() => {
    setLoaded(true)
    onLoad?.()
  }, [onLoad])

  const cooldown = useCooldown(delay, handleLoad)

  useEffect(() => {
    cooldown.start()
    return cooldown.clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{loaded ? children : fallback}</>
}

export { DelayedLoad }
export type { DelayedLoadProps }
