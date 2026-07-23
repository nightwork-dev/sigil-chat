import { mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { describe, expect, it } from "vitest"

import { createFileSessionArtifactStore } from "@workspace/artifact-store/repository"
import type { SigilAuthSession } from "./auth/server"
import {
  readArtifactImage,
  type ArtifactImageDependencies,
} from "./artifact-image.server"

const session = {
  user: { id: "user-1", role: "member" },
} as SigilAuthSession

async function imageStore() {
  const store = createFileSessionArtifactStore({
    root: await mkdtemp(join(tmpdir(), "sigil-web-artifacts-")),
  })
  const artifact = await store.putFile({
    bytes: new TextEncoder().encode("image"),
    filename: "image.png",
    mediaType: "image/png",
    scope: "session:thread-1",
  })
  return { store, artifact }
}

function dependencies(
  overrides: Partial<ArtifactImageDependencies> = {},
): ArtifactImageDependencies {
  return {
    getSession: () => Promise.resolve(session),
    ownedThreadHomeScope: (userId, threadId) =>
      userId === "user-1" && threadId === "thread-1"
        ? "personal-scope:user-1"
        : undefined,
    ...overrides,
  }
}

describe("artifact image authorization", () => {
  it("denies anonymous reads before reading artifacts", async () => {
    const response = await readArtifactImage(
      new Request(
        "https://chat.example.test/api/media/artifact?key=uploads%2Fimage.png&scope=session:thread-1",
      ),
      dependencies({ getSession: () => Promise.resolve(null) }),
    )
    expect(response.status).toBe(401)
  })

  it("hides artifacts from a session the user does not own", async () => {
    const response = await readArtifactImage(
      new Request(
        "https://chat.example.test/api/media/artifact?key=uploads%2Fimage.png&scope=session:thread-2",
      ),
      dependencies(),
    )
    expect(response.status).toBe(404)
  })

  it("rejects unavailable project and persona scopes", async () => {
    for (const scope of ["project:other", "persona:any"]) {
      const response = await readArtifactImage(
        new Request(
          `https://chat.example.test/api/media/artifact?key=uploads%2Fimage.png&scope=${scope}`,
        ),
        dependencies(),
      )
      expect(response.status).toBe(404)
    }
  })

  it("serves an authorized artifact from the shared repository", async () => {
    const { store, artifact } = await imageStore()
    const response = await readArtifactImage(
      new Request(
        `https://chat.example.test/api/media/artifact?key=${encodeURIComponent(artifact.id)}&scope=session:thread-1`,
      ),
      dependencies({ store }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("private")
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(await response.text()).toBe("image")
  })
})
