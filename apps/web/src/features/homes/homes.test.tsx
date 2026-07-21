// @vitest-environment jsdom
//
// Home component tests — the full state matrix from the SC.7 proposal:
// normal, shared-via, canonical-owner label, empty, loading, denied,
// archived, attention, compact (mobile), and keyboard (roving tabindex).

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { ProjectHome } from "./project-home"
import { WorkspaceHome } from "./workspace-home"
import { SessionHome } from "./session-home"
import {
  archivedWorkspaceHome,
  emptyProjectHome,
  fixtureAgents,
  fixtureActivity,
  fixtureArtifactRows,
  fixtureAttention,
  fixtureResources,
  fixtureWorkSource,
  NORTHSTAR,
  restrictedMountRow,
} from "./fixtures"
import type {
  ProjectHomeView,
  SessionHomeView,
  WorkspaceHomeView,
} from "./types"

beforeAll(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

let container: HTMLDivElement | null = null
let root: Root | null = null

/** Rows render TanStack Links, so tests need a router context — a minimal
 *  in-memory tree suffices; nothing here navigates. The router must finish
 *  its initial load before the match renders, hence async. */
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

const projectView: ProjectHomeView = {
  header: {
    scopeId: NORTHSTAR.commerce,
    kind: "project",
    name: "Commerce Platform",
    icon: "🛒",
    description: "Storefront and checkout.",
    status: "active",
  },
  workspaces: [
    {
      id: NORTHSTAR.checkoutReliability,
      name: "Checkout Reliability",
      icon: "🧯",
      description: "Error budget work.",
      status: "active",
      relation: "owned",
      href: "/workspaces/workspace:checkout-reliability",
    },
    {
      id: NORTHSTAR.holidayLaunch,
      name: "Holiday Launch",
      icon: "🎁",
      description: "The holiday campaign.",
      status: "active",
      relation: "mounted",
      canonicalOwnerName: "Brand",
      href: "/workspaces/workspace:holiday-launch?via=project%3Acommerce-platform",
    },
    restrictedMountRow,
  ],
  sessions: [
    {
      id: "t-1",
      title: "Retry storm triage",
      personaId: "neve",
      status: "active",
      updatedAt: "2026-07-21T10:00:00Z",
      workspaceId: NORTHSTAR.checkoutReliability,
      workspaceName: "Checkout Reliability",
      href: "/sessions/t-1",
    },
  ],
  agents: fixtureAgents,
  resources: fixtureResources,
  work: fixtureWorkSource.summariesForScope(NORTHSTAR.commerce),
  activity: fixtureActivity,
  attention: fixtureAttention,
}

const sharedWorkspaceView: WorkspaceHomeView = {
  header: {
    scopeId: NORTHSTAR.holidayLaunch,
    kind: "workspace",
    name: "Holiday Launch",
    icon: "🎁",
    description: "The holiday campaign.",
    status: "active",
  },
  ownership: {
    enteredViaName: "Commerce Platform",
    canonicalOwnerName: "Brand",
  },
  sessions: [
    {
      id: "t-2",
      title: "Draft Holiday Offers",
      personaId: "neve",
      status: "active",
      updatedAt: "2026-07-21T09:00:00Z",
      href: "/sessions/t-2?via=project%3Acommerce-platform",
    },
  ],
  agents: fixtureAgents,
  resources: fixtureResources,
  work: fixtureWorkSource.summariesForScope(NORTHSTAR.holidayLaunch),
  activity: fixtureActivity,
  attention: fixtureAttention,
}

function workspaceList(el: HTMLElement): HTMLElement[] {
  return Array.from(
    el.querySelectorAll<HTMLElement>(
      "section[aria-label='Workspaces'] [data-home-row]",
    ),
  )
}

const sessionView: SessionHomeView = {
  header: {
    scopeId: NORTHSTAR.draftOffers,
    kind: "session",
    name: "Draft Holiday Offers",
    status: "active",
  },
  workspaceName: "Holiday Launch",
  artifacts: fixtureArtifactRows,
  commitments: fixtureWorkSource.commitmentsForSession(NORTHSTAR.draftOffers),
  activity: fixtureActivity,
  attention: fixtureAttention,
}

describe("load lifecycle", () => {
  it("loading renders per-section skeletons, busy-labelled", async () => {
    const el = await render(<ProjectHome state={{ kind: "loading" }} />)
    expect(el.querySelector("[data-testid='home-skeleton']")).toBeTruthy()
    expect(el.querySelector("[aria-busy='true']")).toBeTruthy()
    expect(el.textContent).not.toContain("Commerce Platform")
  })

  it("denied + discoverable states access plainly and offers a real help path", async () => {
    const el = await render(
      <WorkspaceHome state={{ kind: "denied", discoverable: true }} />,
    )
    expect(el.querySelector("[data-testid='home-denied']")).toBeTruthy()
    expect(el.textContent).toContain("You don't have access")
    expect(el.textContent).toContain("Ask about access")
    expect(el.querySelector("a")?.getAttribute("href")).toBe("/chat")
  })

  it("denied + not discoverable reveals nothing", async () => {
    const el = await render(
      <WorkspaceHome state={{ kind: "denied", discoverable: false }} />,
    )
    expect(el.querySelector("[data-testid='home-not-found']")).toBeTruthy()
    expect(el.textContent).not.toContain("Ask about access")
    expect(el.textContent).not.toContain("Holiday Launch")
  })
})

describe("project home", () => {
  it("composes workspaces, sessions, agents, resources, work, and attention", async () => {
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: projectView }} />,
    )
    expect(
      el.querySelector("header")?.getAttribute("aria-label"),
    ).toBe("Commerce Platform overview")
    expect(el.querySelector("h1")).toBeNull()
    expect(el.textContent).toContain("Checkout Reliability")
    expect(el.textContent).toContain("Retry storm triage")
    expect(el.textContent).toContain("Neve Laine")
    expect(el.textContent).toContain("Holiday offer brief")
    expect(el.textContent).toContain("Split payment capture")
    expect(el.textContent).toContain("Offer eligibility rules spike")
  })

  it("labels a mounted resource with its home, quietly", async () => {
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: projectView }} />,
    )
    expect(el.textContent).toContain("Shared from Checkout Reliability")
  })

  it("labels a mounted workspace with its canonical owner, quietly", async () => {
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: projectView }} />,
    )
    const chip = el.querySelector("[data-testid='mount-chip']")
    expect(chip?.textContent).toBe("Shared from Brand")
  })

  it("renders a restricted mount inert: no name, no link, not in the roving list", async () => {
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: projectView }} />,
    )
    const restricted = el.querySelector("[data-testid='restricted-row']")
    expect(restricted).toBeTruthy()
    expect(restricted?.textContent).toContain("Restricted workspace")
    expect(restricted?.getAttribute("data-home-row")).toBeNull()
    expect(restricted?.closest("a")).toBeNull()
    expect(el.textContent).toContain("Ask about access")
  })

  it("rollup work names its canonical home instead of pretending locality", async () => {
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: projectView }} />,
    )
    expect(el.textContent).toContain("Home: Holiday Launch")
  })

  it("empty project shows CTAs in every section", async () => {
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: emptyProjectHome }} />,
    )
    expect(el.textContent).toContain("No workspaces here yet.")
    expect(el.textContent).toContain("Ask for a workspace")
    expect(el.textContent).toContain("Open chat")
    expect(el.textContent).toContain("No work is tracked here yet.")
  })

  it("labels cross-view attention with its noted-from scope", async () => {
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: projectView }} />,
    )
    expect(el.textContent).toContain("noted from Holiday Launch")
  })
})

describe("workspace home", () => {
  it("shows entered-via and canonical owner as projection, not a badge", async () => {
    const el = await render(
      <WorkspaceHome state={{ kind: "ready", view: sharedWorkspaceView }} />,
    )
    const chip = el.querySelector("[data-testid='ownership-chip']")
    expect(chip?.textContent).toContain("Viewing via Commerce Platform")
    expect(chip?.textContent).toContain("Shared from Brand")
  })

  it("archived workspace is read-only: banner up top, no create CTAs", async () => {
    const el = await render(
      <WorkspaceHome state={{ kind: "ready", view: archivedWorkspaceHome }} />,
    )
    expect(el.querySelector("[data-testid='archived-banner']")).toBeTruthy()
    expect(el.textContent).toContain("read-only")
    expect(el.textContent).not.toContain("Open chat")
    expect(el.textContent).not.toContain("Request a feature")
  })
})

describe("session home", () => {
  it("names its home workspace without claiming ownership", async () => {
    const el = await render(
      <SessionHome state={{ kind: "ready", view: sessionView }} />,
    )
    expect(
      el.querySelector("[data-testid='session-home-workspace']")?.textContent,
    ).toBe("Session in Holiday Launch")
    expect(el.textContent).toContain("Produced here")
    expect(el.textContent).toContain("Linked commitments")
    expect(el.textContent).toContain("Offer eligibility matrix")
  })

  it("empty commitments say 'explicitly linked', not 'nothing exists'", async () => {
    const empty: SessionHomeView = {
      ...sessionView,
      commitments: [],
      artifacts: [],
    }
    const el = await render(
      <SessionHome state={{ kind: "ready", view: empty }} />,
    )
    expect(el.textContent).toContain("No work is explicitly linked")
    expect(el.textContent).toContain("hasn't produced anything yet")
  })
})

describe("keyboard — roving tabindex", () => {
  it("exactly one row is tabbable; arrows move focus within the list", async () => {
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: projectView }} />,
    )
    const rows = workspaceList(el)
    expect(rows.length).toBe(2) // restricted row is not a roving row
    expect(rows.map((r) => r.tabIndex)).toEqual([0, -1])

    rows[0].focus()
    act(() => {
      rows[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(rows[1])
    expect(rows.map((r) => r.tabIndex)).toEqual([-1, 0])

    act(() => {
      rows[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(rows[0])

    act(() => {
      rows[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(rows[1])
  })

  it("a leading restricted row still leaves exactly one tabbable row", async () => {
    const restrictedFirst: ProjectHomeView = {
      ...projectView,
      workspaces: [
        restrictedMountRow,
        ...projectView.workspaces.filter((row) => !("restricted" in row)),
      ],
    }
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: restrictedFirst }} />,
    )
    const rows = workspaceList(el)
    expect(rows.length).toBe(2)
    expect(rows.filter((row) => row.tabIndex === 0)).toHaveLength(1)
  })
})

describe("via propagation — the path you arrived by survives the click", () => {
  it("a mounted workspace row links out with ?via=<project>", async () => {
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: projectView }} />,
    )
    const rows = workspaceList(el)
    expect(rows[0].getAttribute("href")).toBe(
      "/workspaces/workspace:checkout-reliability",
    )
    expect(rows[1].getAttribute("href")).toContain("via=")
    expect(rows[1].getAttribute("href")).toContain("holiday-launch")
  })

  it("a session row on a shared workspace home carries the via forward", async () => {
    const el = await render(
      <WorkspaceHome state={{ kind: "ready", view: sharedWorkspaceView }} />,
    )
    const sessionLink = el.querySelector(
      "section[aria-label='Sessions'] [data-home-row]",
    )
    expect(sessionLink?.getAttribute("href")).toContain("via=")
  })
})

describe("compact (mobile) density", () => {
  it("hides descriptions and tightens the page frame", async () => {
    const el = await render(
      <ProjectHome state={{ kind: "ready", view: projectView }} compact />,
    )
    expect(el.textContent).not.toContain("Error budget work.")
    const page = el.querySelector("[data-testid='project-home']")
    expect(page?.className).not.toContain("max-w-3xl")
  })
})
