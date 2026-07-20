import { describe, expect, it } from "vitest"

import { createReadinessRoute } from "./readiness"

describe("authenticated agent readiness", () => {
  it("rejects unauthenticated requests before inspecting model auth", async () => {
    let inspected = false
    const route = createReadinessRoute(async () => null, {
      hasModelAuth: async () => {
        inspected = true
        return true
      },
    })

    const response = await route.handler(
      new Request("http://agent.test/sigil/v1/readiness"),
      {} as never,
    )
    expect(response.status).toBe(401)
    expect(inspected).toBe(false)
  })

  it("fails closed when the model credential is unavailable", async () => {
    const route = createReadinessRoute(
      async () => ({
        attributes: {},
        authenticator: "test",
        principalId: "owner-1",
        principalType: "user",
      }),
      { hasModelAuth: async () => false },
    )

    const response = await route.handler(
      new Request("http://agent.test/sigil/v1/readiness"),
      {} as never,
    )
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ status: "unavailable" })
  })

  it("reports ready only after authentication and model credential checks", async () => {
    const route = createReadinessRoute(
      async () => ({
        attributes: {},
        authenticator: "test",
        principalId: "user-1",
        principalType: "user",
      }),
      { hasModelAuth: async () => true },
    )

    const response = await route.handler(
      new Request("http://agent.test/sigil/v1/readiness"),
      {} as never,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
})
