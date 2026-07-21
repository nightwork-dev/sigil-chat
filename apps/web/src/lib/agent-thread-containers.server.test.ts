import { describe, expect, it } from "vitest";

import {
  legacyContainerProjection,
  resolveScopePerspective,
  type ProjectWorkspaceNav,
} from "./agent-thread-containers.server";

const nav: ProjectWorkspaceNav = {
  personalProjectId: "project-a",
  projects: [
    {
      id: "project-a",
      name: "Project A",
      description: "",
      members: [],
      settings: {},
      createdAt: "2026-07-21T00:00:00.000Z",
      createdBy: "owner",
    },
    {
      id: "project-b",
      name: "Project B",
      description: "",
      members: [],
      settings: {},
      createdAt: "2026-07-21T00:00:00.000Z",
      createdBy: "owner",
    },
  ],
  workspaces: [
    {
      id: "workspace-b",
      projectId: "project-b",
      homeScopeId: "project-b",
      mountedProjectIds: ["project-a"],
      name: "Shared workspace",
      description: "",
      status: "active",
      createdAt: "2026-07-21T00:00:00.000Z",
      createdBy: "owner",
    },
  ],
};

describe("resolveScopePerspective", () => {
  it("preserves a valid mounted-in entry project", () => {
    expect(
      resolveScopePerspective(
        { focusScopeId: "workspace-b", viaScopeIds: ["project-a"] },
        nav,
      ),
    ).toEqual({
      perspective: { focusScopeId: "workspace-b", viaScopeIds: ["project-a"] },
    });
  });

  it("falls back to the canonical home without retaining a stale path", () => {
    expect(
      resolveScopePerspective(
        { focusScopeId: "workspace-b", viaScopeIds: ["project-missing"] },
        nav,
      ),
    ).toEqual({
      perspective: { focusScopeId: "workspace-b", viaScopeIds: ["project-b"] },
      diagnostic: "scope-perspective-fallback",
    });
  });

  it("returns no perspective for a focus the visible nav does not contain", () => {
    expect(
      resolveScopePerspective(
        { focusScopeId: "workspace-hidden", viaScopeIds: ["project-a"] },
        nav,
      ),
    ).toBeUndefined();
  });

  it("does not project a hidden canonical project into legacy selection fields", () => {
    const directlyGrantedNav: ProjectWorkspaceNav = {
      ...nav,
      projects: [nav.projects[0]],
      workspaces: [
        {
          ...nav.workspaces[0],
          mountedProjectIds: [],
        },
      ],
    };
    const resolved = resolveScopePerspective(
      { focusScopeId: "workspace-b", viaScopeIds: ["project-b"] },
      directlyGrantedNav,
    );

    expect(resolved).toEqual({
      perspective: { focusScopeId: "workspace-b", viaScopeIds: [] },
      diagnostic: "scope-perspective-fallback",
    });
    expect(
      legacyContainerProjection(resolved!.perspective, directlyGrantedNav),
    ).toEqual({ workspaceId: "workspace-b" });
  });
});
