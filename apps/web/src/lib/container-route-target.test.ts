import { describe, expect, it } from "vitest"

import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"

import {
  resolveProjectRouteParam,
  resolveWorkspaceRouteParam,
} from "./container-route-target"

const NAV: ProjectWorkspaceNavSummary = {
  personalProjectId: "project:personal",
  projects: [
    {
      id: "project:personal",
      slug: "personal",
      name: "Personal",
      description: "",
    },
    {
      id: "project:11111111-1111-4111-8111-111111111111",
      slug: "commerce-platform",
      name: "Commerce Platform",
      description: "",
    },
  ],
  workspaces: [
    {
      id: "workspace:22222222-2222-4222-8222-222222222222",
      slug: "holiday-launch",
      projectId: "project:11111111-1111-4111-8111-111111111111",
      mountedProjectIds: [],
      name: "Holiday Launch",
      description: "",
      status: "active",
    },
  ],
}

describe("resolveProjectRouteParam", () => {
  it("resolves by canonical slug", () => {
    expect(resolveProjectRouteParam(NAV, "commerce-platform")?.id).toBe(
      "project:11111111-1111-4111-8111-111111111111",
    )
  })

  it("resolves by legacy/UUID id", () => {
    expect(
      resolveProjectRouteParam(
        NAV,
        "project:11111111-1111-4111-8111-111111111111",
      )?.slug,
    ).toBe("commerce-platform")
  })

  it("returns undefined for an unknown candidate or missing nav", () => {
    expect(resolveProjectRouteParam(NAV, "no-such-project")).toBeUndefined()
    expect(resolveProjectRouteParam(undefined, "commerce-platform")).toBeUndefined()
  })
})

describe("resolveWorkspaceRouteParam", () => {
  it("resolves by canonical slug", () => {
    expect(resolveWorkspaceRouteParam(NAV, "holiday-launch")?.id).toBe(
      "workspace:22222222-2222-4222-8222-222222222222",
    )
  })

  it("resolves by legacy/UUID id", () => {
    expect(
      resolveWorkspaceRouteParam(
        NAV,
        "workspace:22222222-2222-4222-8222-222222222222",
      )?.slug,
    ).toBe("holiday-launch")
  })

  it("returns undefined for an unknown candidate or missing nav", () => {
    expect(resolveWorkspaceRouteParam(NAV, "no-such-workspace")).toBeUndefined()
    expect(
      resolveWorkspaceRouteParam(undefined, "holiday-launch"),
    ).toBeUndefined()
  })
})
