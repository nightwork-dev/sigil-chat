// Locks the omnibar switcher's landing target (SC.10 §6 step 9 follow-up,
// updated for container slugs): picking a project or workspace must land on
// its nested SC.10 home, using the canonical SLUG — never the raw id, and
// never `/chat` (which now resolves to the app-global active thread,
// independent of whichever container was just picked).

import { describe, expect, it } from "vitest"

import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"

import { projectSwitchHref, workspaceSwitchHref } from "./shell-omnibar"

const NAV: Pick<ProjectWorkspaceNavSummary, "projects"> = {
  projects: [
    { id: "project:commerce", slug: "commerce", name: "Commerce", description: "" },
    { id: "project:brand", slug: "brand", name: "Brand", description: "" },
  ],
}

describe("projectSwitchHref", () => {
  it("lands on the nested project home by slug, never /chat", () => {
    const href = projectSwitchHref({ slug: "commerce" })
    expect(href).toBe("/projects/commerce")
    expect(href).not.toBe("/chat")
  })
})

describe("workspaceSwitchHref", () => {
  it("prefers the workspace's own owning project's slug, never /chat", () => {
    const href = workspaceSwitchHref(
      { id: "workspace:holiday", slug: "holiday", projectId: "project:brand" },
      NAV,
      "project:commerce",
    )
    expect(href).toBe("/projects/brand/workspaces/holiday")
    expect(href).not.toBe("/chat")
  })

  it("falls back to the active project's slug when the workspace's owner is hidden", () => {
    const href = workspaceSwitchHref(
      { id: "workspace:holiday", slug: "holiday" },
      NAV,
      "project:commerce",
    )
    expect(href).toBe("/projects/commerce/workspaces/holiday")
  })

  it("falls back to the raw id when the active project isn't in nav (defensive, shouldn't happen)", () => {
    const href = workspaceSwitchHref(
      { id: "workspace:holiday", slug: "holiday" },
      NAV,
      "project:unknown",
    )
    expect(href).toBe("/projects/project%3Aunknown/workspaces/holiday")
  })

  it("has nowhere honest to land when neither project id is known", () => {
    expect(
      workspaceSwitchHref(
        { id: "workspace:holiday", slug: "holiday" },
        NAV,
        undefined,
      ),
    ).toBeUndefined()
  })
})
