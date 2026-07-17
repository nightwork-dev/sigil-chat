"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

export interface ScrollSpyTarget {
  id: string
}

export interface UseScrollSpyOptions {
  /** Optional scrolling element. Omit to observe the browser viewport. */
  scrollRootRef?: RefObject<HTMLElement | null>
  /** IntersectionObserver margin; defaults to a narrow band near the top. */
  rootMargin?: string
}

function hashTarget(): string {
  if (typeof window === "undefined") return ""
  const hash = window.location.hash.slice(1)
  try {
    return decodeURIComponent(hash)
  } catch {
    return hash
  }
}

/**
 * Track the target nearest the top of a scroll viewport and provide hash-aware
 * navigation. DOM observation belongs here so display components remain
 * declarative and every consumer shares the same active-section behavior.
 */
export function useScrollSpy(
  targets: readonly ScrollSpyTarget[],
  { scrollRootRef, rootMargin = "-12% 0px -70% 0px" }: UseScrollSpyOptions = {},
) {
  const firstId = targets[0]?.id ?? ""
  const [activeId, setActiveId] = useState(firstId)
  const targetIds = targets.map((target) => target.id)
  const targetKey = targetIds.join("\u0000")
  const targetIdsRef = useRef(targetIds)
  targetIdsRef.current = targetIds

  useEffect(() => {
    const ids = targetIdsRef.current
    const fromHash = hashTarget()
    const validHash = Boolean(fromHash && ids.includes(fromHash))
    setActiveId((current) => {
      if (ids.includes(current)) return current
      return ids[0] ?? ""
    })
    const hashTimer = validHash ? window.setTimeout(() => {
      setActiveId(fromHash)
      document.getElementById(fromHash)?.scrollIntoView({ block: "start" })
    }, 500) : undefined

    if (typeof IntersectionObserver === "undefined") {
      return () => {
        if (hashTimer !== undefined) window.clearTimeout(hashTimer)
      }
    }

    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) return

    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top)
          else visible.delete(entry.target.id)
        }

        let nearestId = ""
        let nearestTop = Number.POSITIVE_INFINITY
        for (const [id, top] of visible) {
          if (top < nearestTop) {
            nearestId = id
            nearestTop = top
          }
        }
        if (nearestId) setActiveId(nearestId)
      },
      {
        root: scrollRootRef?.current ?? null,
        rootMargin,
        threshold: 0,
      },
    )

    for (const element of elements) observer.observe(element)

    const onHashChange = () => {
      const id = hashTarget()
      if (ids.includes(id)) setActiveId(id)
    }
    window.addEventListener("hashchange", onHashChange)

    return () => {
      if (hashTimer !== undefined) window.clearTimeout(hashTimer)
      observer.disconnect()
      window.removeEventListener("hashchange", onHashChange)
    }
  }, [rootMargin, scrollRootRef, targetKey])

  const navigate = useCallback((id: string) => {
    const element = document.getElementById(id)
    if (!element) return

    const root = scrollRootRef?.current
    if (root) {
      const scrollMargin = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0
      const targetTop = root.scrollTop + element.getBoundingClientRect().top - root.getBoundingClientRect().top - scrollMargin
      root.scrollTo({ top: targetTop, behavior: "smooth" })

      const url = new URL(window.location.href)
      url.hash = id
      window.history.replaceState(window.history.state, "", url)
    } else {
      const nextHash = `#${encodeURIComponent(id)}`
      if (window.location.hash === nextHash) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`)
      }
      window.location.hash = nextHash
    }
    setActiveId(id)
  }, [scrollRootRef])

  return { activeId, navigate }
}
