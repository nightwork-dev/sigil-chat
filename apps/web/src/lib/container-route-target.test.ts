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

  // Authz regression (finding 1, 2026-07-23): a crafted project whose `id`
  // equals a victim's `slug` must not shadow the victim via first-match.
  it("treats an id-vs-slug collision across two DIFFERENT records as ambiguous, not first-match", () => {
    const spoofed: ProjectWorkspaceNavSummary = {
      ...NAV,
      projects: [
        ...NAV.projects,
        {
          // The attacker's id equals the victim's slug.
          id: "commerce-platform",
          slug: "attacker-project",
          name: "Attacker Project",
          description: "",
        },
      ],
    }
    // Without the ambiguity guard, `.find` would first-match the attacker's
    // record here (id === candidate) and never reach the victim.
    expect(resolveProjectRouteParam(spoofed, "commerce-platform")).toBeUndefined()
    // The attacker's own slug still resolves to the attacker — only the
    // colliding candidate is ambiguous, not every lookup involving them.
    expect(resolveProjectRouteParam(spoofed, "attacker-project")?.id).toBe(
      "commerce-platform",
    )
  })

  it("an unrelated third project in the nav does not disturb normal resolution", () => {
    const withThird: ProjectWorkspaceNavSummary = {
      ...NAV,
      projects: [
        ...NAV.projects,
        { id: "project:third", slug: "third-project", name: "Third", description: "" },
      ],
    }
    expect(resolveProjectRouteParam(withThird, "commerce-platform")?.id).toBe(
      "project:11111111-1111-4111-8111-111111111111",
    )
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

  it("treats an id-vs-slug collision across two DIFFERENT records as ambiguous, not first-match", () => {
    const spoofed: ProjectWorkspaceNavSummary = {
      ...NAV,
      workspaces: [
        ...NAV.workspaces,
        {
          id: "holiday-launch",
          slug: "attacker-workspace",
          projectId: "project:11111111-1111-4111-8111-111111111111",
          mountedProjectIds: [],
          name: "Attacker Workspace",
          description: "",
          status: "active",
        },
      ],
    }
    expect(
      resolveWorkspaceRouteParam(spoofed, "holiday-launch"),
    ).toBeUndefined()
  })
})
