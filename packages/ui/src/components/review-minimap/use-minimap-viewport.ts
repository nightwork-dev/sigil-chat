// Document-scroll → minimap viewport math. Tracks window scroll/resize and
// reports the visible viewport as a {top, height} percentage of the whole
// document, plus imperative scroll helpers the track uses on pointer/keys.
// Browser-only (window/document); safe under SSR because the reads live in an
// effect + event handlers, never at module or render time.

import { useEffect, useState } from "react"

function clampPct(value: number, max = 100) {
  return Math.max(0, Math.min(max, value))
}

export function useMinimapViewport() {
  const [viewport, setViewport] = useState({ top: 0, height: 12 })

  useEffect(() => {
    const update = () => {
      const scrollHeight = Math.max(window.innerHeight, document.documentElement.scrollHeight)
      const maxScroll = Math.max(1, scrollHeight - window.innerHeight)
      const height = Math.max(8, Math.min(42, (window.innerHeight / scrollHeight) * 100))
      setViewport({
        top: clampPct((window.scrollY / maxScroll) * 100, 100 - height),
        height,
      })
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [])

  return viewport
}

export function scrollDocumentToPct(pct: number) {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
  window.scrollTo({ top: clampPct(pct, 1) * maxScroll, behavior: "auto" })
}

export function scrollDocumentFromTrackPointer(clientY: number, track: HTMLElement) {
  const rect = track.getBoundingClientRect()
  const pct = clampPct((clientY - rect.top) / Math.max(1, rect.height), 1)
  scrollDocumentToPct(pct)
}
