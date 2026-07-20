import { describe, expect, it } from "vitest"

import { assertAuthorizedScope } from "./agent-scope-delegation"

describe("agent scope authorization", () => {
  it("requires a session scope to belong to the authenticated user", () => {
    const ownsThread = (userId: string, threadId: string) =>
      userId === "user-1" && threadId === "thread-1"

    expect(() =>
      assertAuthorizedScope("session:thread-1", "user-1", ownsThread),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope("session:thread-1", "user-2", ownsThread),
    ).toThrow("not found")
  })

  it("rejects malformed scope strings", () => {
    expect(() =>
      assertAuthorizedScope("session:", "user-1", () => true),
    ).toThrow("invalid")
    expect(() =>
      assertAuthorizedScope("global:anything", "user-1", () => true),
    ).toThrow("invalid")
  })

  it("allows only registered shared scopes and fails closed for persona scope", () => {
    expect(() =>
      assertAuthorizedScope("project:evidence-room", "user-1", () => false),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope("project:other", "user-1", () => false),
    ).toThrow("not available")
    expect(() =>
      assertAuthorizedScope("persona:any", "user-1", () => false),
    ).toThrow("not available")
  })
})
