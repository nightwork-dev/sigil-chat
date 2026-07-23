import { mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { describe, expect, it, vi } from "vitest"

import { createFileSessionArtifactStore } from "@workspace/artifact-store/repository"
import type { SigilAuthSession } from "./auth/server"
import {
  listArtifacts,
  readArtifactPreview,
  type ArtifactAccessDependencies,
} from "./artifacts.server"

const session = {
  user: { id: "user-1", role: "member" },
} as SigilAuthSession

async function storeWithArtifact() {
  const store = createFileSessionArtifactStore({
    root: await mkdtemp(join(tmpdir(), "sigil-web-artifacts-")),
  })
  const artifact = await store.putFile({
    bytes: new TextEncoder().encode("A useful source note"),
    filename: "notes.md",
    mediaType: "text/plain",
    scope: "session:thread-1",
  })
  return { store, artifact }
}

function dependencies(
  overrides: Partial<ArtifactAccessDependencies> = {},
): ArtifactAccessDependencies {
  return {
    getSession: () => Promise.resolve(session),
    ownedThreadHomeScope: (userId, threadId) =>
      userId === "user-1" && threadId === "thread-1"
        ? "personal-scope:user-1"
        : undefined,
    ...overrides,
  }
}

describe("artifact workspace access", () => {
  it("lists an owned session scope through the shared artifact store", async () => {
    const store = createFileSessionArtifactStore({
      root: await mkdtemp(join(tmpdir(), "sigil-web-artifacts-")),
    })
    await store.putFile({
      bytes: new TextEncoder().encode("note"),
      filename: "notes.md",
      mediaType: "text/markdown",
      scope: "session:thread-1",
    })
    const artifacts = await listArtifacts(
      "session:thread-1",
      dependencies({ store }),
    )
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({
      filename: "notes.md",
      mediaType: "text/markdown",
      size: 4,
    })
  })

  it("denies an unowned scope before it reads the store", async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      listArtifacts("session:thread-2", dependencies()),
    ).rejects.toThrow("Agent session was not found")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("returns an in-app textual preview through the shared byte store", async () => {
    const { store, artifact } = await storeWithArtifact()
    await expect(
      readArtifactPreview(
        { scope: "session:thread-1", id: artifact.id },
        dependencies({ store }),
      ),
    ).resolves.toEqual({
      kind: "text",
      mediaType: "text/plain",
      content: "A useful source note",
      truncated: false,
    })
  })
})
