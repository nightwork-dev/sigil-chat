import { describe, expect, it, vi } from "vitest"
import {
  createHealthResponse,
  createLivenessResponse,
  isHealthRequestAuthorized,
} from "../src/health.js"

describe("Gonk health endpoint", () => {
  it("keeps liveness public while readiness requires the exact service bearer", async () => {
    const liveness = createLivenessResponse()
    expect(liveness.status).toBe(200)
    expect(liveness.headers.get("cache-control")).toBe("no-store")
    expect(await liveness.json()).toEqual({ status: "live" })

    expect(isHealthRequestAuthorized(undefined, "service-key")).toBe(false)
    expect(isHealthRequestAuthorized("Bearer wrong", "service-key")).toBe(false)
    expect(isHealthRequestAuthorized("Bearer service-key", "service-key")).toBe(
      true,
    )
  })

  it("proves the artifact store can write, read, and update its manifest", async () => {
    const bytes = new TextEncoder().encode("sigil-chat-gonk-health-v1")
    const artifacts = {
      putFile: vi.fn().mockResolvedValue({ id: "health-object" }),
      readContent: vi.fn().mockResolvedValue({
        bytes,
        mediaType: "text/plain",
      }),
      removeFromScope: vi.fn().mockResolvedValue(true),
    }

    const response = await createHealthResponse(artifacts)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: "ok",
      service: "sigil-chat-gonk",
      checks: { artifactStore: "ok" },
    })
    expect(artifacts.putFile).toHaveBeenCalledOnce()
    expect(artifacts.readContent).toHaveBeenCalledWith(
      "health-object",
      { tier: "session", id: "service-health" },
    )
    expect(artifacts.removeFromScope).toHaveBeenCalledOnce()
  })

  it("fails readiness without leaking store errors", async () => {
    const response = await createHealthResponse({
      putFile: vi.fn().mockRejectedValue(new Error("private store path")),
      readContent: vi.fn(),
      removeFromScope: vi.fn(),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      status: "error",
      service: "sigil-chat-gonk",
      checks: { artifactStore: "error" },
    })
  })
})
