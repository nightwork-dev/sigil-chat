// The /home redirect's resolution rules.

import { describe, expect, it } from "vitest"

import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"

import { homeTarget } from "./home-target"

const nav: ProjectWorkspaceNavSummary = {
  personalProjectId: "personal:u1",
  projects: [
    { id: "personal:u1", name: "Personal", description: "" },
    { id: "project:brand", name: "Brand", description: "" },
    { id: "project:commerce", name: "Commerce", description: "" },
  ],
  workspaces: [
    {
      id: "workspace:holiday",
      projectId: "project:brand",
      mountedProjectIds: ["project:commerce"],
      name: "Holiday Launch",
      description: "",
      status: "active",
    },
  ],
}

describe("homeTarget", () => {
  it("no selection → the personal project home", () => {
    expect(
      homeTarget({ projectId: undefined, workspaceId: undefined }, nav),
    ).toBe("/projects/personal:u1")
  })

  it("project only → that project home", () => {
    expect(
      homeTarget({ projectId: "project:brand", workspaceId: undefined }, nav),
    ).toBe("/projects/project:brand")
  })

  it("workspace in its canonical project → canonical workspace home, no via", () => {
    expect(
      homeTarget(
        { projectId: "project:brand", workspaceId: "workspace:holiday" },
        nav,
      ),
    ).toBe("/workspaces/workspace:holiday")
  })

  it("workspace entered via a non-owner project → via preserved", () => {
    expect(
      homeTarget(
        { projectId: "project:commerce", workspaceId: "workspace:holiday" },
        nav,
      ),
    ).toBe(
      `/workspaces/workspace:holiday?via=${encodeURIComponent("project:commerce")}`,
    )
  })

  it("workspace whose canonical home is hidden → via preserved, never substituted", () => {
    const hiddenNav: ProjectWorkspaceNavSummary = {
      ...nav,
      workspaces: nav.workspaces.map((w) => ({ ...w, projectId: undefined })),
    }
    expect(
      homeTarget(
        { projectId: "project:commerce", workspaceId: "workspace:holiday" },
        hiddenNav,
      ),
    ).toContain("via=")
  })

  it("a workspace that vanished from the visible nav falls back to the project home", () => {
    expect(
      homeTarget(
        { projectId: "project:brand", workspaceId: "workspace:gone" },
        nav,
      ),
    ).toBe("/projects/project:brand")
  })
})
