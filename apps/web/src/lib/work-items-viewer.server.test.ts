import { describe, expect, it } from "vitest";

import { AuthenticationRequiredError } from "./auth/session";
import {
  authenticatedWorkItemsViewer,
  boardViewVisibleToViewer,
  boardViewsVisibleToViewer,
} from "./work-items-viewer.server";
import type { WorkItemsScopeAccess } from "./work-items-access.server";
import type { BoardView } from "@workspace/work-items-store/types";

const viewer = { id: "principal-1", role: "member" as const, username: null };
const access: WorkItemsScopeAccess = {
  canAccess: (_principalId, scopeId) => scopeId !== "scope-hidden",
  canonicalDescendants: (scopeId) => [scopeId],
  rollupSubjects: (scopeId) => [scopeId],
};

function board(id: string, roots: string[]): BoardView {
  return {
    id,
    ownerScopeId: roots[0] ?? "scope-visible",
    ownerPrincipalId: "principal-1",
    name: id,
    visibility: "private",
    roots,
    traversal: "self",
    filters: {},
    groupBy: "status",
    revision: 1,
  };
}

describe("authenticated work-items viewer", () => {
  it("fails closed without a verified Better Auth session", () => {
    expect(() => authenticatedWorkItemsViewer(null)).toThrow(
      AuthenticationRequiredError,
    );
  });

  it("projects only server-verified addressing identity", () => {
    expect(
      authenticatedWorkItemsViewer({
        session: { id: "session-1", expiresAt: new Date() },
        user: {
          id: "principal-1",
          email: "member@example.test",
          name: "Member",
          role: "member",
          username: "reviewer-two",
        },
      }),
    ).toEqual({
      id: "principal-1",
      role: "member",
      username: "reviewer-two",
    });
  });

  it("omits a board with an unauthorized root before it reaches the browser", () => {
    expect(
      boardViewsVisibleToViewer(
        [
          board("visible-board", ["scope-visible"]),
          board("hidden-board", ["scope-hidden"]),
        ],
        viewer,
        access,
      ),
    ).toEqual([board("visible-board", ["scope-visible"])]);
  });

  it("uses an opaque miss for an unauthorized board without disclosing its id", () => {
    const hidden = board("board-secret-42", ["scope-hidden"]);
    expect(() => boardViewVisibleToViewer(hidden, viewer, access)).toThrow(
      "Board view was not found.",
    );
    expect(() => boardViewVisibleToViewer(hidden, viewer, access)).not.toThrow(
      "board-secret-42",
    );
  });
});
