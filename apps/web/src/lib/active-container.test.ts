import { describe, expect, it } from "vitest";

import { resolveActiveContainerSelection } from "./active-container";

describe("resolveActiveContainerSelection", () => {
  it("does not expose a hidden canonical project for a directly granted workspace", () => {
    const selection = resolveActiveContainerSelection(
      {
        members: ["user-1"],
        activePerspective: {
          focusScopeId: "workspace-b",
          viaScopeIds: [],
        },
        updatedAt: "2026-07-21T00:00:00.000Z",
      },
      {
        personalProjectId: "project-a",
        projects: [
          { id: "project-a", name: "Project A", description: "" },
        ],
        workspaces: [
          {
            id: "workspace-b",
            name: "Direct grant",
            description: "",
            mountedProjectIds: [],
            status: "active",
          },
        ],
      },
    );

    expect(selection).toEqual({
      perspective: { focusScopeId: "workspace-b", viaScopeIds: [] },
      projectId: undefined,
      workspaceId: "workspace-b",
      projectName: undefined,
      workspaceName: "Direct grant",
    });
    expect(JSON.stringify(selection)).not.toContain("project-b");
  });
});
