// The /home redirect's resolution rules.

import { describe, expect, it } from "vitest"

import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"

import { homeTarget } from "./home-target"

const nav: ProjectWorkspaceNavSummary = {
  personalProjectId: "personal:u1",
  projects: [
    { id: "personal:u1", slug: "personal", name: "Personal", description: "" },
    { id: "project:brand", slug: "brand", name: "Brand", description: "" },
    { id: "project:commerce", slug: "commerce", name: "Commerce", description: "" },
  ],
  workspaces: [
    {
      id: "workspace:holiday",
      slug: "holiday",
      projectId: "project:brand",
      mountedProjectIds: ["project:commerce"],
      name: "Holiday Launch",
      description: "",
      status: "active",
    },
  ],
}

describe("homeTarget", () => {
  it("no selection → the personal project home, as its slug", () => {
    expect(
      homeTarget({ projectId: undefined, workspaceId: undefined }, nav),
    ).toBe("/projects/personal")
  })

  it("project only → that project home, as its slug", () => {
    expect(
      homeTarget({ projectId: "project:brand", workspaceId: undefined }, nav),
    ).toBe("/projects/brand")
  })

  it("workspace in its canonical project → nested canonical workspace home, both as slugs", () => {
    expect(
      homeTarget(
        { projectId: "project:brand", workspaceId: "workspace:holiday" },
        nav,
      ),
    ).toBe("/projects/brand/workspaces/holiday")
  })

  it("workspace entered via a non-owner project → that project is the path prefix, as its slug", () => {
    expect(
      homeTarget(
        { projectId: "project:commerce", workspaceId: "workspace:holiday" },
        nav,
      ),
    ).toBe("/projects/commerce/workspaces/holiday")
  })

  it("workspace whose canonical home is hidden → entered-via project still the path prefix", () => {
    const hiddenNav: ProjectWorkspaceNavSummary = {
      ...nav,
      workspaces: nav.workspaces.map((w) => ({ ...w, projectId: undefined })),
    }
    expect(
      homeTarget(
        { projectId: "project:commerce", workspaceId: "workspace:holiday" },
        hiddenNav,
      ),
    ).toBe("/projects/commerce/workspaces/holiday")
  })

  it("a workspace that vanished from the visible nav falls back to the project home", () => {
    expect(
      homeTarget(
        { projectId: "project:brand", workspaceId: "workspace:gone" },
        nav,
      ),
    ).toBe("/projects/brand")
  })
})
