import { describe, expect, it } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import {
  createBoardTraversalResolver,
  prepareBoardViewForUpsert,
  requireBoardViewMutationAccess,
  requireWorkItemsMutationAccess,
  type WorkItemsScopeAccess,
} from "./work-items-access.server";
import type { BoardView } from "@workspace/work-items-store/types";
import { queryBoardView } from "@workspace/work-items-store/operations";
import type { Story } from "@workspace/work-items-store/types";

function session(role: "member" | "owner"): SigilAuthSession {
  return {
    session: { id: "session-1" } as SigilAuthSession["session"],
    user: {
      id: "user-1",
      role,
      username: "example-user",
    } as SigilAuthSession["user"],
  }
}

const board: BoardView = {
  id: "board-visible",
  ownerScopeId: "project-a",
  ownerPrincipalId: "user-1",
  name: "Visible board",
  visibility: "private",
  roots: ["project-a"],
  traversal: "self-and-rollups",
  filters: {},
  groupBy: "status",
  revision: 1,
};

function scopeAccess(
  allowed: readonly string[],
  actions?: string[],
): WorkItemsScopeAccess {
  return {
    canAccess: ({ scopeId, action }) => {
      actions?.push(action);
      return allowed.includes(scopeId);
    },
    canonicalDescendants: (scopeId) =>
      scopeId === "project-a" ? ["project-a", "workspace-a"] : [scopeId],
    rollupSubjects: (scopeId) =>
      scopeId === "project-a" ? ["project-a", "workspace-rollup"] : [scopeId],
  };
}

describe("work-item mutation access", () => {
  it("rejects anonymous callers", () => {
    expect(() => requireWorkItemsMutationAccess(null)).toThrow(
      "Authentication required",
    )
  })

  it("rejects authenticated members", () => {
    expect(() => requireWorkItemsMutationAccess(session("member"))).toThrow(
      "Owner access required",
    )
  })

  it("accepts the deployment owner", () => {
    expect(requireWorkItemsMutationAccess(session("owner")).user.role).toBe(
      "owner",
    )
  })

  it("does not expand an unauthorized root or return an unauthorized result", () => {
    const resolver = createBoardTraversalResolver(
      "user-1",
      scopeAccess(["project-a", "workspace-a"]),
    );

    expect(
      resolver.resolve(["project-hidden", "project-a"], "self-and-rollups"),
    ).toEqual([
      { scopeId: "project-a", rootScopeId: "project-a" },
      { scopeId: "workspace-a", rootScopeId: "project-a" },
    ]);

    const visible = story("work-visible", "workspace-a");
    const hidden = story("work-hidden", "workspace-rollup");
    expect(queryBoardView([visible, hidden], board, resolver).items).toEqual([
      expect.objectContaining({
        story: expect.objectContaining({ id: "work-visible" }),
      }),
    ]);
  });

  it("requests board.read for every traversal authorization", () => {
    const actions: string[] = [];
    createBoardTraversalResolver(
      "user-1",
      scopeAccess(["project-a", "workspace-a"], actions),
    ).resolve(["project-a"], "self-and-rollups");

    expect(actions).toHaveLength(4);
    expect(new Set(actions)).toEqual(new Set(["board.read"]));
  });

  it("deduplicates an overlapping multi-root traversal by first declared root", () => {
    const resolver = createBoardTraversalResolver("user-1", {
      canAccess: () => true,
      canonicalDescendants: (scopeId) =>
        scopeId === "project-a"
          ? ["project-a", "workspace-shared"]
          : scopeId === "project-b"
            ? ["project-b", "workspace-shared"]
            : [scopeId],
      rollupSubjects: (scopeId) => [scopeId],
    });

    expect(
      resolver.resolve(["project-a", "project-b"], "self-and-rollups"),
    ).toEqual([
      { scopeId: "project-a", rootScopeId: "project-a" },
      { scopeId: "workspace-shared", rootScopeId: "project-a" },
      { scopeId: "project-b", rootScopeId: "project-b" },
    ]);
  });

  it("lets a member save only their private board over authorized scopes", () => {
    expect(() =>
      requireBoardViewMutationAccess(
        session("member"),
        board,
        scopeAccess(["project-a"]),
      ),
    ).not.toThrow();
    expect(() =>
      requireBoardViewMutationAccess(
        session("member"),
        { ...board, roots: ["project-hidden"] },
        scopeAccess(["project-a"]),
      ),
    ).toThrow("Board view scope is not available");
  });

  it("derives private ownership and rejects a takeover on update", () => {
    const callerShaped = { ...board, ownerPrincipalId: "attacker" };
    expect(prepareBoardViewForUpsert(callerShaped, "user-1")).toMatchObject({
      ownerPrincipalId: "user-1",
    });

    const existing = { ...board, ownerPrincipalId: "user-1" };
    expect(
      prepareBoardViewForUpsert(callerShaped, "user-1", existing),
    ).toMatchObject({ ownerPrincipalId: "user-1" });
    expect(() =>
      prepareBoardViewForUpsert(callerShaped, "user-2", existing),
    ).toThrow("Board view was not found.");
  });

  it("keeps published-to-private and private-to-published updates owner-only", () => {
    const published = { ...board, visibility: "published" as const };
    const privateView = { ...board, visibility: "private" as const };
    const access = scopeAccess(["project-a"]);

    expect(() =>
      requireBoardViewMutationAccess(
        session("member"),
        privateView,
        access,
        published,
      ),
    ).toThrow("Owner access required");
    expect(() =>
      requireBoardViewMutationAccess(
        session("member"),
        published,
        access,
        privateView,
      ),
    ).toThrow("Owner access required");
  });
});

function story(id: string, homeScopeId: string): Story {
  return {
    id,
    kind: "task",
    homeScopeId,
    scopeBindings: [],
    provenance: {
      origin: "principal",
      actorPrincipalId: "user-1",
      createdAt: "2026-07-21T00:00:00.000Z",
    },
    revision: 1,
    epicId: "scoped-work",
    epicTitle: "Scoped work",
    title: id,
    intent: id,
    acceptanceCriteria: [],
    status: "ready",
    routing: "implementation",
    reviewGate: "none",
    deps: [],
    authoredBy: "user-1",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
  };
}
