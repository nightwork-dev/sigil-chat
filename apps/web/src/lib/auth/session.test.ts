import { describe, expect, it } from "vitest"

import type { SigilAuthSession } from "./server"
import {
  AuthenticationRequiredError,
  OwnerRequiredError,
  requireOwner,
  requireSession,
} from "./session"

function session(role: "member" | "owner"): SigilAuthSession {
  return {
    session: { expiresAt: new Date(Date.now() + 60_000), id: "session-1" },
    user: {
      email: "user@example.test",
      id: "user-1",
      name: "User",
      role,
      username: "user",
    },
  }
}

describe("auth assertions", () => {
  it("rejects an unauthenticated request", () => {
    expect(() => requireSession(null)).toThrow(AuthenticationRequiredError)
  })

  it("rejects an authenticated member from owner-only work", () => {
    expect(() => requireOwner(session("member"))).toThrow(OwnerRequiredError)
  })

  it("accepts an owner", () => {
    expect(() => requireOwner(session("owner"))).not.toThrow()
  })
})
