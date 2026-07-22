import { describe, expect, it } from "vitest"

import { ServiceDiagnosticError, measureService } from "./system-status"

describe("system status measurement", () => {
  it("records successful dependency latency", async () => {
    const times = [100, 124]
    await expect(
      measureService(
        "web",
        "Web",
        () => Promise.resolve(),
        () => times.shift()!,
      ),
    ).resolves.toEqual({
      id: "web",
      label: "Web",
      latencyMs: 24,
      status: "healthy",
    })
  })

  it("fails closed with a generic diagnostic when the error is not public", async () => {
    const times = [100, 110]
    const status = await measureService(
      "eve",
      "Agent runtime",
      () => Promise.reject(new Error("secret path and token")),
      () => times.shift()!,
    )

    expect(status).toEqual({
      id: "eve",
      label: "Agent runtime",
      latencyMs: 10,
      status: "unhealthy",
      diagnostic: "Dependency probe failed. Check the service logs.",
    })
    expect(JSON.stringify(status)).not.toContain("secret")
  })

  it("uses explicit public diagnostics without exposing raw error text", async () => {
    const times = [100, 112]
    const status = await measureService(
      "gonk",
      "Gonk",
      () =>
        Promise.reject(
          new ServiceDiagnosticError(
            "Gonk readiness returned HTTP 503. Check artifact-store logs.",
          ),
        ),
      () => times.shift()!,
    )

    expect(status).toEqual({
      id: "gonk",
      label: "Gonk",
      latencyMs: 12,
      status: "unhealthy",
      diagnostic:
        "Gonk readiness returned HTTP 503. Check artifact-store logs.",
    })
  })
})
