"use client"

// §4.1 — one active agent presentation per region, and the shell dock yields
// to a route that owns a fuller presentation. The rule is STRUCTURAL, not
// path-based: a surface registers the presentation it owns on mount and
// unregisters on unmount; the shell dock reads the registry and suppresses
// itself whenever any fuller presentation is registered. No pathname checks —
// a route that stops owning a presentation (unmount, feature-flag, error
// boundary) automatically returns the dock.
//
// What counts as "fuller": `sidecar` (in-flow panel beside a subject) and
// `full` (the route IS the conversation — /chat). Registering an `inline`
// variant (transient, anchored to a selection) does NOT suppress the dock —
// the inline lives in the main-content region and the dock in the floating
// slot; §4.1 wants both active in that case.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type AgentSurfacePresentation = "full" | "sidecar" | "inline"

/**
 * The suppression rule, as a pure predicate (pinned by the regression test):
 * the dock yields to `full` and `sidecar`; an `inline` variant coexists with
 * the dock because it lives in the main-content region while the dock floats
 * (§4.1's two-regions case).
 */
export function shouldSuppressDock(
  presentations: Iterable<AgentSurfacePresentation>,
): boolean {
  for (const presentation of presentations) {
    if (presentation === "full" || presentation === "sidecar") return true
  }
  return false
}

interface AgentSurfaceRegistry {
  /** True when any registered presentation should suppress the shell dock. */
  dockSuppressed: boolean
  /** The currently registered presentations (ids are opaque, for debugging). */
  presentations: ReadonlyMap<number, AgentSurfacePresentation>
  register: (presentation: AgentSurfacePresentation) => number
  unregister: (id: number) => void
}

const AgentSurfaceContext = createContext<AgentSurfaceRegistry | null>(null)

export function AgentSurfaceProvider({ children }: { children: ReactNode }) {
  const [presentations, setPresentations] = useState<
    ReadonlyMap<number, AgentSurfacePresentation>
  >(new Map())

  // Stable across presentation changes — if these recreated per registration,
  // a claimant's effect (which depends on the registry) would re-run on every
  // claim, registering again, forever. (The regression test caught this as an
  // infinite render loop.)
  const register = useCallback((presentation: AgentSurfacePresentation) => {
    const id = nextId++
    setPresentations((current) => {
      const next = new Map(current)
      next.set(id, presentation)
      return next
    })
    return id
  }, [])
  const unregister = useCallback((id: number) => {
    setPresentations((current) => {
      if (!current.has(id)) return current
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }, [])

  const value = useMemo<AgentSurfaceRegistry>(() => {
    const dockSuppressed = shouldSuppressDock(presentations.values())
    return { dockSuppressed, presentations, register, unregister }
  }, [presentations, register, unregister])

  return (
    <AgentSurfaceContext.Provider value={value}>
      {children}
    </AgentSurfaceContext.Provider>
  )
}

let nextId = 1

/** Read the registry. Throws outside the provider — the shell dock and every
 *  registering surface must live under AgentSurfaceProvider. */
export function useAgentSurfaceRegistry(): AgentSurfaceRegistry {
  const ctx = useContext(AgentSurfaceContext)
  if (!ctx) {
    throw new Error(
      "useAgentSurfaceRegistry must be used within <AgentSurfaceProvider>.",
    )
  }
  return ctx
}

/**
 * Declare that this surface owns an agent presentation. Registration lives
 * exactly as long as the component is mounted — the structural rule.
 *
 * Pass `enabled: false` to register conditionally (e.g. only while the
 * presentation is actually visible at the current breakpoint) without
 * violating the rules of hooks.
 */
export function useRegisterAgentPresentation(
  presentation: AgentSurfacePresentation,
  options: { enabled?: boolean } = {},
): void {
  const registry = useAgentSurfaceRegistry()
  const enabled = options.enabled ?? true
  // Depend on the stable register/unregister functions ONLY — depending on
  // the registry object itself re-runs this effect on every claim (its
  // identity changes with the presentations map), registering forever.
  const { register, unregister } = registry
  useEffect(() => {
    if (!enabled) return
    const id = register(presentation)
    return () => unregister(id)
  }, [register, unregister, presentation, enabled])
}

/**
 * A minimal matchMedia hook for breakpoint-conditional presentation claims
 * (the sidecar rail is hidden below lg, so its suppression must be too).
 * Returns false during SSR / before the first effect — the dock's first
 * paint is never suppressed by a presentation that isn't visible yet.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [query])
  return matches
}
