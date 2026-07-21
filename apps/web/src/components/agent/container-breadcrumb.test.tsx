// @vitest-environment jsdom
//
// The breadcrumb split control (SC.7): the crumb label is a Link to the
// container's home; the chevron is a separate, labelled switcher trigger.
// Two stops, neither hidden behind the other.

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { ContainerMenu } from "./container-breadcrumb"

beforeAll(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

let container: HTMLDivElement | null = null
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

const items = [
  { id: "a", label: "Alpha", active: true, onSelect: () => {} },
  { id: "b", label: "Beta", active: false, onSelect: () => {} },
]

describe("ContainerMenu split control", () => {
  it("label is a link to the home; chevron is a separate labelled trigger", async () => {
    const el = await render(
      <ContainerMenu label="Commerce Platform" href="/projects/p1" items={items} />,
    )
    const link = el.querySelector("[data-testid='crumb-home-link']")
    expect(link?.getAttribute("href")).toBe("/projects/p1")
    expect(link?.textContent).toContain("Commerce Platform")
    const trigger = el.querySelector("[aria-label='Switch Commerce Platform']")
    expect(trigger).toBeTruthy()
    // The trigger is NOT inside the link — two independent stops.
    expect(trigger?.closest("a")).toBeNull()
  })

  it("without a home target the label is inert text, not a dead link", async () => {
    const el = await render(<ContainerMenu label="Workspace" items={items} />)
    expect(el.querySelector("[data-testid='crumb-home-link']")).toBeNull()
    expect(el.querySelector("a")).toBeNull()
    expect(el.textContent).toContain("Workspace")
  })
})
