import { describe, expect, it, vi } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import {
  readArtifactImage,
  type ArtifactImageDependencies,
} from "./artifact-image.server"

const session = {
  user: { id: "user-1", role: "member" },
} as SigilAuthSession

function dependencies(
  overrides: Partial<ArtifactImageDependencies> = {},
): ArtifactImageDependencies {
  return {
    fetcher: () =>
      Promise.resolve(
        new Response("image", {
          headers: { "content-type": "image/png" },
        }),
      ),
    getSession: () => Promise.resolve(session),
    ownsThread: (userId, threadId) =>
      userId === "user-1" && threadId === "thread-1",
    readEnvironment: () => ({
      apiKey: "service-key",
      gonkMcpUrl: "https://tools.example.test/mcp",
    }),
    ...overrides,
  }
}

describe("artifact image authorization", () => {
  it("denies anonymous reads before contacting Gonk", async () => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await readArtifactImage(
      new Request("https://chat.example.test/img/key?scope=session:thread-1"),
      dependencies({ fetcher, getSession: () => Promise.resolve(null) }),
    )
    expect(response.status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("hides artifacts from a session the user does not own", async () => {
    const fetcher = vi.fn<typeof fetch>()
    const response = await readArtifactImage(
      new Request("https://chat.example.test/img/key?scope=session:thread-2"),
      dependencies({ fetcher }),
    )
    expect(response.status).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("rejects unavailable project and persona scopes", async () => {
    for (const scope of ["project:other", "persona:any"]) {
      const response = await readArtifactImage(
        new Request(`https://chat.example.test/img/key?scope=${scope}`),
        dependencies(),
      )
      expect(response.status).toBe(404)
    }
  })

  it("proxies an authorized artifact with the service credential", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response("image", {
          headers: { "content-type": "image/png" },
        }),
      ),
    )
    const response = await readArtifactImage(
      new Request("https://chat.example.test/img/key?scope=session:thread-1"),
      dependencies({ fetcher }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("private")
    const [, init] = fetcher.mock.calls[0]!
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer service-key",
    )
    expect(new Headers(init?.headers).get("x-sigil-scope")).toBe(
      "session:thread-1",
    )
  })
})
