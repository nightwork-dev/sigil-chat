// @vitest-environment jsdom
//
// Regression test for the SC.10 §9.2 promotion bug: ProjectWorkspaceNav used
// to render its thread rows with <SheetClose>, which calls
// useDialogRootContext() internally. That's fine inside the compact/mobile
// Sheet form (AgentSessionSwitcher), but the moment the SAME component was
// promoted into the persistent sidebar pane (session-list-pane.tsx, §9.5
// step 1) — no Dialog/Sheet ancestor at all — it crashed on the live dev
// server: "Cannot destructure property 'store' of
// useDialogRootContext(...) as it is undefined."
//
// ThreadGroup is the row-rendering unit that used SheetClose; it takes only
// props, no context hooks, so mounting it bare (no providers, no Sheet) is
// exactly the persistent-pane condition. This must render without throwing.

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { ThreadGroup } from "./project-workspace-nav"
import type { AgentThreadSummary } from "@/lib/agent-threads-domain"

beforeAll(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

let container: HTMLDivElement | null = null
let root: Root | null = null

async function render(element: React.ReactElement): Promise<HTMLElement> {
  // A bare root route with no Sheet/Dialog anywhere in the tree — the exact
  // shape of the persistent sidebar pane, which has no Dialog ancestor.
  const rootRoute = createRootRoute({ component: () => element })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  await act(async () => {
    await router.load()
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(<RouterProvider router={router} />))
  return container
}

afterEach(() => {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
})

const THREAD: AgentThreadSummary = {
  id: "thread-1",
  slug: "abc12345",
  title: "Draft the launch email",
  personaId: "sigil-chat-eve",
  status: "active",
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
  revision: 1,
}

describe("ThreadGroup outside any Dialog root", () => {
  it("renders without a Dialog ancestor (the persistent-pane condition)", async () => {
    const el = await render(
      <ThreadGroup
        activeThreadId={THREAD.id}
        busy={false}
        label="Unfiled"
        onSelectThread={() => {}}
        threads={[THREAD]}
      />,
    )
    expect(el.textContent).toContain("Draft the launch email")
    expect(el.querySelector("button")).toBeTruthy()
  })

  it("calls onSelectThread and onDismiss on click, without needing a Sheet", async () => {
    const onSelectThread = vi.fn()
    const onDismiss = vi.fn()
    const el = await render(
      <ThreadGroup
        busy={false}
        onDismiss={onDismiss}
        onSelectThread={onSelectThread}
        threads={[THREAD]}
      />,
    )
    const button = el.querySelector("button")
    expect(button).toBeTruthy()
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(onSelectThread).toHaveBeenCalledWith(THREAD.id)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it("renders nothing for an empty group (no crash on the empty-state path either)", async () => {
    const el = await render(
      <ThreadGroup busy={false} onSelectThread={() => {}} threads={[]} />,
    )
    expect(el.textContent).toBe("")
  })
})
