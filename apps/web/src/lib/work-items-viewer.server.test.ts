import { describe, expect, it } from "vitest";

import { AuthenticationRequiredError } from "./auth/session";
import { authenticatedWorkItemsViewer } from "./work-items-viewer.server";

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
      user: {
        id: "principal-1",
        email: "member@example.test",
        name: "Member",
        role: "member",
        username: "reviewer-two",
      },
    });
  });
});
