// Locks the omnibar switcher's landing target (SC.10 §6 step 9 follow-up):
// picking a project or workspace must land on its nested SC.10 home, never
// on `/chat` (which now resolves to the app-global active thread,
// independent of whichever container was just picked).

import { describe, expect, it } from "vitest"

import { projectSwitchHref, workspaceSwitchHref } from "./shell-omnibar"

describe("projectSwitchHref", () => {
  it("lands on the nested project home, never /chat", () => {
    const href = projectSwitchHref("project:commerce")
    expect(href).toBe("/projects/project%3Acommerce")
    expect(href).not.toBe("/chat")
  })
})

describe("workspaceSwitchHref", () => {
  it("prefers the workspace's own owning project, never /chat", () => {
    const href = workspaceSwitchHref(
      { id: "workspace:holiday", projectId: "project:brand" },
      "project:commerce",
    )
    expect(href).toBe("/projects/project%3Abrand/workspaces/workspace%3Aholiday")
    expect(href).not.toBe("/chat")
  })

  it("falls back to the active project when the workspace's owner is hidden", () => {
    const href = workspaceSwitchHref(
      { id: "workspace:holiday" },
      "project:commerce",
    )
    expect(href).toBe(
      "/projects/project%3Acommerce/workspaces/workspace%3Aholiday",
    )
  })

  it("has nowhere honest to land when neither project id is known", () => {
    expect(
      workspaceSwitchHref({ id: "workspace:holiday" }, undefined),
    ).toBeUndefined()
  })
})
