import { describe, expect, it } from "vitest"

import { createReadinessRoute } from "./readiness"

describe("authenticated agent readiness", () => {
  it("rejects unauthenticated requests before inspecting model auth", async () => {
    let inspected = false
    const route = createReadinessRoute(() => Promise.resolve(null), {
      hasModelAuth: () => {
        inspected = true
        return Promise.resolve(true)
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
      () =>
        Promise.resolve({
          attributes: {},
          authenticator: "test",
          principalId: "owner-1",
          principalType: "user",
        }),
      { hasModelAuth: () => Promise.resolve(false) },
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
      () =>
        Promise.resolve({
          attributes: {},
          authenticator: "test",
          principalId: "user-1",
          principalType: "user",
        }),
      {
        applicationToolCount: () => 17,
        hasModelAuth: () => Promise.resolve(true),
      },
    )

    const response = await route.handler(
      new Request("http://agent.test/sigil/v1/readiness"),
      {} as never,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      applicationTools: { count: 17, status: "ready" },
    })
  })
})
