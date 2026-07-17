// DOM measurement via ResizeObserver — one of this repo's explicitly
// legitimate useEffect uses (see CLAUDE.md), since there's no way to derive
// an element's rendered pixel width without observing the actual DOM node.

import { useEffect, useState, type RefObject } from "react"

export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [ref])

  return width
}
