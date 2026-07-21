// Adapter tests — the claims that keep entered-via presentation-only:
//
// 1. Ordering and de-duplication run through the shared graph contract
//    (traverseScopeLinks), not a local sort.
// 2. A via label appears only when workspace, via project, and mount are ALL
//    visible in the permission-filtered input — anything less falls back
//    silently.
// 3. A hidden canonical owner is never named or substituted.

import { describe, expect, it } from "vitest"

import type { AgentThreadSummary } from "@/lib/agent-threads"
import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"

import {
  buildProjectHome,
  buildWorkspaceHome,
  projectWorkspaceRows,
  resolveViaLabel,
  scopeLinksFromNav,
} from "./home-view-model"
import { fixtureWorkSource, NORTHSTAR } from "./fixtures"

const nav: ProjectWorkspaceNavSummary = {
  personalProjectId: "project:personal",
  projects: [
    { id: "project:personal", name: "Personal", description: "", icon: "🏠" },
    {
      id: NORTHSTAR.commerce,
      name: "Commerce Platform",
      description: "Storefront and checkout.",
      icon: "🛒",
    },
    {
      id: NORTHSTAR.brand,
      name: "Brand",
      description: "Campaigns and identity.",
      icon: "✦",
    },
  ],
  workspaces: [
    {
      id: NORTHSTAR.checkoutReliability,
      projectId: NORTHSTAR.commerce,
      mountedProjectIds: [],
      name: "Checkout Reliability",
      description: "Error budget work.",
      icon: "🧯",
      status: "active",
    },
    {
      id: NORTHSTAR.holidayLaunch,
      projectId: NORTHSTAR.brand,
      mountedProjectIds: [NORTHSTAR.commerce],
      name: "Holiday Launch",
      description: "The holiday campaign.",
      icon: "🎁",
      status: "active",
    },
  ],
}

function thread(partial: Partial<AgentThreadSummary> & { id: string }): AgentThreadSummary {
  return {
    personaId: "neve",
    title: partial.id,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
    status: "active",
    revision: 1,
    ...partial,
  }
}

const threads: AgentThreadSummary[] = [
  thread({ id: "t-checkout", workspaceId: NORTHSTAR.checkoutReliability }),
  thread({ id: "t-holiday", workspaceId: NORTHSTAR.holidayLaunch }),
  thread({ id: "t-personal" }),
]

describe("scopeLinksFromNav", () => {
  it("re-materializes mounts as ordered mounted-in links", () => {
    const links = scopeLinksFromNav(nav)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      kind: "mounted-in",
      subjectScopeId: NORTHSTAR.holidayLaunch,
      targetScopeId: NORTHSTAR.commerce,
      order: 0,
    })
  })
})

describe("projectWorkspaceRows", () => {
  it("lists owned first, then mounted in traversal order", () => {
    const rows = projectWorkspaceRows(nav, NORTHSTAR.commerce)
    expect(rows.map((row) => ("id" in row ? row.id : "restricted"))).toEqual([
      NORTHSTAR.checkoutReliability,
      NORTHSTAR.holidayLaunch,
    ])
    const mounted = rows[1]
    expect("relation" in mounted && mounted.relation).toBe("mounted")
    expect(
      "canonicalOwnerName" in mounted && mounted.canonicalOwnerName,
    ).toBe("Brand")
  })

  it("omits the owner name when the canonical project is not visible", () => {
    const hiddenOwnerNav: ProjectWorkspaceNavSummary = {
      ...nav,
      workspaces: nav.workspaces.map((workspace) =>
        workspace.id === NORTHSTAR.holidayLaunch
          ? { ...workspace, projectId: undefined }
          : workspace,
      ),
    }
    const rows = projectWorkspaceRows(hiddenOwnerNav, NORTHSTAR.commerce)
    const mounted = rows.find(
      (row) => "id" in row && row.id === NORTHSTAR.holidayLaunch,
    )
    expect(mounted && "canonicalOwnerName" in mounted
      ? mounted.canonicalOwnerName
      : "unset").toBeUndefined()
  })

  it("links owned rows canonically and mounted rows with the entered-via perspective", () => {
    const rows = projectWorkspaceRows(nav, NORTHSTAR.commerce)
    const [owned, mounted] = rows as Array<{ href: string }>
    expect(owned.href).toBe(`/workspaces/${NORTHSTAR.checkoutReliability}`)
    expect(mounted.href).toBe(
      `/workspaces/${NORTHSTAR.holidayLaunch}?via=${encodeURIComponent(NORTHSTAR.commerce)}`,
    )
  })

  it("never duplicates a workspace mounted into its own list position", () => {
    const selfNav: ProjectWorkspaceNavSummary = {
      ...nav,
      workspaces: nav.workspaces.map((workspace) =>
        workspace.id === NORTHSTAR.checkoutReliability
          ? { ...workspace, mountedProjectIds: [NORTHSTAR.commerce] }
          : workspace,
      ),
    }
    const rows = projectWorkspaceRows(selfNav, NORTHSTAR.commerce)
    const ids = rows.map((row) => ("id" in row ? row.id : "restricted"))
    expect(ids.filter((id) => id === NORTHSTAR.checkoutReliability)).toHaveLength(1)
  })
})

describe("buildProjectHome", () => {
  it("returns undefined for a project absent from the visible nav", () => {
    expect(
      buildProjectHome({ nav, threads, work: fixtureWorkSource }, "project:hidden"),
    ).toBeUndefined()
  })

  it("lists sessions of owned and mounted workspaces, via only on mounted", () => {
    const view = buildProjectHome(
      { nav, threads, work: fixtureWorkSource },
      NORTHSTAR.commerce,
    )
    expect(view?.sessions.map((s) => s.id).sort()).toEqual([
      "t-checkout",
      "t-holiday",
    ])
    const byId = new Map(view?.sessions.map((s) => [s.id, s.href]))
    expect(byId.get("t-checkout")).toBe("/sessions/t-checkout")
    expect(byId.get("t-holiday")).toBe(
      `/sessions/t-holiday?via=${encodeURIComponent(NORTHSTAR.commerce)}`,
    )
    // From the canonical home, the same session carries no via.
    const brand = buildProjectHome(
      { nav, threads, work: fixtureWorkSource },
      NORTHSTAR.brand,
    )
    expect(brand?.sessions.find((s) => s.id === "t-holiday")?.href).toBe(
      "/sessions/t-holiday",
    )
  })

  it("keeps workspace-less sessions in the personal project only", () => {
    const personal = buildProjectHome(
      { nav, threads, work: fixtureWorkSource },
      "project:personal",
    )
    expect(personal?.sessions.map((s) => s.id)).toEqual(["t-personal"])
    const brand = buildProjectHome(
      { nav, threads, work: fixtureWorkSource },
      NORTHSTAR.brand,
    )
    expect(brand?.sessions.map((s) => s.id)).toEqual(["t-holiday"])
  })
})

describe("resolveViaLabel — entered-via is presentation only", () => {
  it("labels a valid entered-via perspective with both names", () => {
    expect(
      resolveViaLabel(nav, NORTHSTAR.holidayLaunch, NORTHSTAR.commerce),
    ).toEqual({
      enteredViaName: "Commerce Platform",
      enteredViaScopeId: NORTHSTAR.commerce,
      canonicalOwnerName: "Brand",
    })
  })

  it("returns nothing when the via IS the canonical owner", () => {
    expect(
      resolveViaLabel(nav, NORTHSTAR.holidayLaunch, NORTHSTAR.brand),
    ).toBeUndefined()
  })

  it("returns nothing when the via project is not visible", () => {
    expect(
      resolveViaLabel(nav, NORTHSTAR.holidayLaunch, "project:hidden"),
    ).toBeUndefined()
  })

  it("returns nothing when no mount supports the claimed path", () => {
    expect(
      resolveViaLabel(nav, NORTHSTAR.checkoutReliability, NORTHSTAR.brand),
    ).toBeUndefined()
  })

  it("labels the via without naming a hidden canonical owner", () => {
    const hiddenOwnerNav: ProjectWorkspaceNavSummary = {
      ...nav,
      workspaces: nav.workspaces.map((workspace) =>
        workspace.id === NORTHSTAR.holidayLaunch
          ? { ...workspace, projectId: undefined }
          : workspace,
      ),
    }
    expect(
      resolveViaLabel(hiddenOwnerNav, NORTHSTAR.holidayLaunch, NORTHSTAR.commerce),
    ).toEqual({
      enteredViaName: "Commerce Platform",
      enteredViaScopeId: NORTHSTAR.commerce,
      canonicalOwnerName: undefined,
    })
  })
})

describe("buildWorkspaceHome", () => {
  it("propagates archived status to the header", () => {
    const archivedNav: ProjectWorkspaceNavSummary = {
      ...nav,
      workspaces: nav.workspaces.map((workspace) =>
        workspace.id === NORTHSTAR.holidayLaunch
          ? { ...workspace, status: "archived" as const }
          : workspace,
      ),
    }
    const view = buildWorkspaceHome(
      { nav: archivedNav, threads, work: fixtureWorkSource },
      NORTHSTAR.holidayLaunch,
    )
    expect(view?.header.status).toBe("archived")
  })

  it("scopes sessions to the workspace regardless of entry perspective", () => {
    const view = buildWorkspaceHome(
      { nav, threads, work: fixtureWorkSource },
      NORTHSTAR.holidayLaunch,
      NORTHSTAR.commerce,
    )
    expect(view?.sessions.map((s) => s.id)).toEqual(["t-holiday"])
    expect(view?.ownership?.enteredViaName).toBe("Commerce Platform")
  })
})
