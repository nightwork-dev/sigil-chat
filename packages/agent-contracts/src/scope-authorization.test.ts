import { describe, expect, it } from "vitest";

import { hasScopeGrant, type ScopeAuthorizationRequest } from "./scope-authorization";

const readWorkspace: ScopeAuthorizationRequest = {
  action: "read",
  canonicalHomeScope: "project:brand",
  principalId: "user-a",
  resourceScope: "workspace:holiday-launch",
};

describe("scope grants", () => {
  it("authorize only the exact resource identity and operation", () => {
    const grants = [
      {
        actions: ["read", "tool"] as const,
        principalId: "user-a",
        resourceScope: "workspace:holiday-launch",
      },
    ];

    expect(hasScopeGrant(grants, readWorkspace)).toBe(true);
    expect(
      hasScopeGrant(grants, {
        ...readWorkspace,
        resourceScope: "workspace:another-workspace",
      }),
    ).toBe(false);
    expect(hasScopeGrant(grants, { ...readWorkspace, action: "discover" })).toBe(false);
  });
});
