import { issueScopeDelegation } from "@workspace/agent-contracts/scope-delegation.server"
import { describe, expect, it } from "vitest"

import { requireAuthorizedResourceScope } from "./scope-authorization"

const SECRET = "test-only-scope-authorization-secret"

function request(scope: string, subject: string, secret = SECRET) {
  const expiresAt = Math.floor(Date.now() / 1_000) + 60
  const proof = issueScopeDelegation({ expiresAt, scope, subject }, secret)
  return new Request("http://agent.test", {
    headers: { "x-sigil-scope": scope, "x-sigil-scope-proof": proof },
  })
}

describe("Eve resource-scope authorization", () => {
  it("accepts an exact signed principal and scope binding", () => {
    expect(
      requireAuthorizedResourceScope({
        principalId: "user-1",
        request: request("session:thread-1", "user-1"),
        secret: SECRET,
      }),
    ).toBe("session:thread-1")
  })

  it("rejects cross-principal and cross-scope replay", () => {
    const authorized = request("session:thread-1", "user-1")
    expect(() =>
      requireAuthorizedResourceScope({
        principalId: "user-2",
        request: authorized,
        secret: SECRET,
      }),
    ).toThrow("NOT_AUTHORIZED")

    const headers = new Headers(authorized.headers)
    headers.set("x-sigil-scope", "session:thread-2")
    expect(() =>
      requireAuthorizedResourceScope({
        principalId: "user-1",
        request: new Request("http://agent.test", { headers }),
        secret: SECRET,
      }),
    ).toThrow("NOT_AUTHORIZED")
  })
})
