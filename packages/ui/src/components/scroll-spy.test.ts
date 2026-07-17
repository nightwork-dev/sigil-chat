// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ScrollSpy, type ScrollSpyItem } from "./scroll-spy"

const ITEMS: ScrollSpyItem[] = [
  { id: "overview", label: "Overview" },
  { id: "behavior", label: "Behavior" },
  { id: "hashes", label: "Shareable links", depth: 1 },
]

let container: HTMLDivElement
let root: Root
let observerCallback: IntersectionObserverCallback

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = "0px"
  readonly thresholds = [0]

  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback
  }

  disconnect() {}
  observe() {}
  takeRecords() { return [] }
  unobserve() {}
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver)
  window.history.replaceState(null, "", "/")
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function entry(target: Element, top: number): IntersectionObserverEntry {
  return {
    target,
    isIntersecting: true,
    boundingClientRect: { top } as DOMRectReadOnly,
  } as IntersectionObserverEntry
}

describe("ScrollSpy", () => {
  it("tracks observed sections and writes shareable hashes on navigation", async () => {
    await act(() => {
      root.render(
        React.createElement(
          ScrollSpy.Root,
          {
            items: ITEMS,
            children: [
              React.createElement(ScrollSpy.List, { key: "nav" }),
              React.createElement(ScrollSpy.Select, { key: "select" }),
              ...ITEMS.map((item) => React.createElement("section", { key: item.id, id: item.id })),
            ],
          },
        ),
      )
    })

    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"))
    expect(links[0]?.getAttribute("aria-current")).toBe("location")
    expect(links[2]?.dataset.depth).toBe("1")
    expect(links[2]?.classList.contains("ml-3")).toBe(true)
    expect(container.querySelector('[data-slot="scroll-spy-select"]')?.textContent).toContain("Overview")

    await act(() => links[1]?.click())

    expect(window.location.hash).toBe("#behavior")
    expect(links[1]?.getAttribute("aria-current")).toBe("location")

    const hashes = container.querySelector<HTMLElement>("#hashes")
    await act(() => observerCallback([entry(hashes!, 10)], {} as IntersectionObserver))
    expect(links[2]?.getAttribute("aria-current")).toBe("location")
  })
})
