// @vitest-environment jsdom
//
// §4.1 regression tests — the one-presentation-per-region rule.
//
// Two layers pinned here:
// 1. shouldSuppressDock — the pure predicate the shell dock reads. If someone
//    narrows it (e.g. drops "sidecar"), the /review doubled-presentation bug
//    class returns and this test goes red.
// 2. The structural claim — registration lives exactly as long as the owning
//    surface is mounted. If registration leaks (no unregister) or never
//    happens, the dock either never comes back or never yields.

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import {
  AgentSurfaceProvider,
  shouldSuppressDock,
  useAgentSurfaceRegistry,
  useRegisterAgentPresentation,
  type AgentSurfacePresentation,
} from "./agent-surface-registry"

describe("shouldSuppressDock", () => {
  it("suppresses for full and sidecar, never for inline or empty", () => {
    expect(shouldSuppressDock([])).toBe(false)
    expect(shouldSuppressDock(["inline"])).toBe(false)
    expect(shouldSuppressDock(["full"])).toBe(true)
    expect(shouldSuppressDock(["sidecar"])).toBe(true)
    // The two-regions case: an inline variant alongside does not change the
    // verdict — the sidecar claim is what suppresses.
    expect(shouldSuppressDock(["inline", "sidecar"])).toBe(true)
  })
})

describe("AgentSurfaceProvider structural claims", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    container = null
    root = null
  })

  function Probe({ onRead }: { onRead: (suppressed: boolean) => void }) {
    const registry = useAgentSurfaceRegistry()
    onRead(registry.dockSuppressed)
    return null
  }

  function Claim({
    presentation,
    enabled,
  }: {
    presentation: AgentSurfacePresentation
    enabled?: boolean
  }) {
    useRegisterAgentPresentation(
      presentation,
      enabled === undefined ? undefined : { enabled },
    )
    return null
  }

  function mount(ui: React.ReactNode, onRead: (s: boolean) => void) {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() =>
      root?.render(
        <AgentSurfaceProvider>
          <Probe onRead={onRead} />
          {ui}
        </AgentSurfaceProvider>,
      ),
    )
  }

  it("a mounted sidecar claim suppresses the dock; unmounting restores it", () => {
    const readings: boolean[] = []
    mount(<Claim presentation="sidecar" />, (s) => readings.push(s))
    expect(readings.at(-1)).toBe(true)

    // Unmount the claiming surface — the dock must come back.
    act(() =>
      root?.render(
        <AgentSurfaceProvider>
          <Probe onRead={(s) => readings.push(s)} />
        </AgentSurfaceProvider>,
      ),
    )
    expect(readings.at(-1)).toBe(false)
  })

  it("an inline claim never suppresses the dock", () => {
    const readings: boolean[] = []
    mount(<Claim presentation="inline" />, (s) => readings.push(s))
    expect(readings.at(-1)).toBe(false)
  })

  it("a disabled claim (presentation hidden at this breakpoint) does not suppress", () => {
    const readings: boolean[] = []
    mount(<Claim presentation="sidecar" enabled={false} />, (s) =>
      readings.push(s),
    )
    expect(readings.at(-1)).toBe(false)
  })
})
