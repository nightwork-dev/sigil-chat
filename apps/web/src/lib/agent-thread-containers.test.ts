import { describe, expect, it } from "vitest";

import {
  deriveThreadProjectId,
  groupThreadsByWorkspace,
  threadsForProject,
  type WorkspaceContainmentLookup,
} from "./agent-thread-containers";

const PERSONAL = "personal:user-1";

function lookup(map: Record<string, string>): WorkspaceContainmentLookup {
  return {
    getWorkspaceProjectId: (workspaceId) => map[workspaceId],
  };
}

describe("deriveThreadProjectId", () => {
  it("resolves an unbound thread to the personal project", () => {
    expect(deriveThreadProjectId({}, lookup({}), PERSONAL)).toBe(PERSONAL);
  });

  it("resolves a bound thread through workspace containment, not a stored field", () => {
    const result = deriveThreadProjectId(
      { workspaceId: "workspace-1" },
      lookup({ "workspace-1": "project-a" }),
      PERSONAL,
    );
    expect(result).toBe("project-a");
  });

  it("falls back to the personal project when the workspace is unknown", () => {
    const result = deriveThreadProjectId(
      { workspaceId: "deleted-workspace" },
      lookup({}),
      PERSONAL,
    );
    expect(result).toBe(PERSONAL);
  });
});

describe("groupThreadsByWorkspace", () => {
  it("buckets by workspace id and keeps unbound threads under the undefined key", () => {
    const threads = [
      { id: "t1", workspaceId: "workspace-1" },
      { id: "t2" },
      { id: "t3", workspaceId: "workspace-1" },
      { id: "t4", workspaceId: "workspace-2" },
    ];

    const groups = groupThreadsByWorkspace(threads);

    expect(groups.get("workspace-1")?.map((t) => t.id)).toEqual(["t1", "t3"]);
    expect(groups.get("workspace-2")?.map((t) => t.id)).toEqual(["t4"]);
    expect(groups.get(undefined)?.map((t) => t.id)).toEqual(["t2"]);
    // Every input thread lands in exactly one bucket — no thread is dropped.
    const totalGrouped = [...groups.values()].reduce(
      (sum, bucket) => sum + bucket.length,
      0,
    );
    expect(totalGrouped).toBe(threads.length);
  });
});

describe("threadsForProject", () => {
  it("filters to threads whose derived project matches, across bound and unbound threads", () => {
    const threads = [
      { id: "t1", workspaceId: "workspace-1" },
      { id: "t2" },
      { id: "t3", workspaceId: "workspace-2" },
    ];
    const map = lookup({ "workspace-1": "project-a", "workspace-2": "project-b" });

    expect(threadsForProject(threads, "project-a", map, PERSONAL).map((t) => t.id)).toEqual(
      ["t1"],
    );
    expect(threadsForProject(threads, PERSONAL, map, PERSONAL).map((t) => t.id)).toEqual(
      ["t2"],
    );
    expect(threadsForProject(threads, "project-c", map, PERSONAL)).toEqual([]);
  });
});
