import { describe, expect, it } from "vitest"
import { createHealthResponse } from "../src/health.js"

describe("Gonk health endpoint", () => {
  it("exposes unauthenticated liveness without configuration or secrets", async () => {
    const response = createHealthResponse()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: "ok",
      service: "sigil-chat-gonk",
    })
  })
})
