import { describe, expect, it } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import { requireWorkItemsMutationAccess } from "./work-items-access.server"

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
})
