// @vitest-environment jsdom
//
// US-006 AC3: a live voice session names the thread it is bound to and links
// back to that thread's canonical slug route, and a request from a different
// thread never moves the binding on its own.

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createVoiceSessionStore,
  voiceBoundThreadHref,
  type VoiceBoundThread as VoiceBoundThreadRecord,
} from "@/lib/voice-session-binding"

import { VoiceBoundThread } from "./voice-bound-thread"

beforeAll(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

let host: HTMLDivElement | null = null
let root: Root | null = null

async function render(element: React.ReactElement): Promise<HTMLElement> {
  const rootRoute = createRootRoute({ component: () => element })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  await act(async () => {
    await router.load()
  })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<RouterProvider router={router} />))
  return host
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  host?.remove()
  root = null
  host = null
})

const PRICING: VoiceBoundThreadRecord = {
  threadId: "thread-1",
  threadSlug: "ab12cd34",
  title: "Pricing review",
}
const ROADMAP: VoiceBoundThreadRecord = {
  threadId: "thread-2",
  threadSlug: "ef56gh78",
  title: "Roadmap sync",
}

describe("VoiceBoundThread", () => {
  it("renders nothing when no capture is live", async () => {
    const store = createVoiceSessionStore()
    const el = await render(<VoiceBoundThread store={store} />)
    expect(el.textContent).toBe("")
  })

  it("names the bound thread and links to its canonical slug route", async () => {
    const store = createVoiceSessionStore()
    store.requestBinding(PRICING)
    const el = await render(<VoiceBoundThread store={store} />)

    const link = el.querySelector("[data-testid='voice-bound-thread-link']")
    expect(link?.textContent).toContain("Pricing review")
    expect(link?.getAttribute("href")).toBe("/sessions/ab12cd34")
  })

  it("keeps container containment in the href when the thread has it", () => {
    expect(
      voiceBoundThreadHref({
        ...PRICING,
        projectSlug: "commerce",
        workspaceSlug: "pricing",
      }),
    ).toBe("/projects/commerce/workspaces/pricing/sessions/ab12cd34")
    expect(voiceBoundThreadHref({ ...PRICING, projectSlug: "commerce" })).toBe(
      "/projects/commerce/sessions/ab12cd34",
    )
  })

  it("never rebinds silently — it says what it did and offers the real choices", async () => {
    const store = createVoiceSessionStore()
    const stop = vi.fn()
    store.requestBinding(PRICING, { stop })
    const el = await render(<VoiceBoundThread store={store} />)

    act(() => {
      expect(store.requestBinding(ROADMAP)).toBe("needs-confirmation")
    })

    // Still bound to the original thread, and the readout says so.
    expect(store.getSnapshot().bound?.threadId).toBe(PRICING.threadId)
    const prompt = el.querySelector("[data-testid='voice-rebind-prompt']")
    expect(prompt?.textContent).toContain("Pricing review")
    expect(prompt?.textContent).toContain("Roadmap sync")
    expect(
      el
        .querySelector("[data-testid='voice-bound-thread-link']")
        ?.getAttribute("href"),
    ).toBe("/sessions/ab12cd34")

    // Freeing voice goes through the capture's own owner. Nothing here can
    // move a live capture to another thread, so nothing here offers to.
    expect(prompt?.textContent).not.toContain("Move")
    const stopButton = [...el.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Stop voice",
    )!
    act(() => stopButton.click())

    expect(stop).toHaveBeenCalledTimes(1)
    // The owner, not this button, clears the binding when it actually stops.
    expect(store.getSnapshot().bound?.threadId).toBe(PRICING.threadId)
    act(() => store.releaseOwned(PRICING.threadId))
    expect(store.getSnapshot().bound).toBeUndefined()
  })

  it("offers one action to stop voice while it is simply live", async () => {
    const store = createVoiceSessionStore()
    const stop = vi.fn()
    store.requestBinding(PRICING, { stop })
    const el = await render(<VoiceBoundThread store={store} />)

    const stopButton = [...el.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Stop voice",
    )!
    act(() => stopButton.click())
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it("ignores a release from a thread that does not hold the binding", () => {
    const store = createVoiceSessionStore()
    store.requestBinding(PRICING)
    store.releaseOwned("some-other-thread")
    expect(store.getSnapshot().bound?.threadId).toBe(PRICING.threadId)
  })

  it("keeping the current binding dismisses the request without moving voice", async () => {
    const store = createVoiceSessionStore()
    store.requestBinding(PRICING)
    const el = await render(<VoiceBoundThread store={store} />)
    act(() => {
      store.requestBinding(ROADMAP)
    })

    const keep = [...el.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Keep",
    )!
    act(() => keep.click())

    expect(store.getSnapshot().bound?.threadId).toBe(PRICING.threadId)
    expect(el.querySelector("[data-testid='voice-rebind-prompt']")).toBeNull()
  })
})
