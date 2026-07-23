import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  ArtifactScopeAccessDeniedError,
  createFileSessionArtifactStore,
} from "@workspace/artifact-store/repository"

import { createWebArtifactScopeAccessCheck } from "./artifact-repository.server"

describe("web artifact store policy", () => {
  it("denies direct cross-principal access even when a route omits authorization", async () => {
    const store = createFileSessionArtifactStore({
      root: await mkdtemp(join(tmpdir(), "sigil-web-artifact-policy-")),
      canAccessScope: createWebArtifactScopeAccessCheck({
        ownedThreadHomeScope: (userId, threadId) =>
          userId === "user-1" && threadId === "thread-1"
            ? "personal-scope:user-1"
            : undefined,
      }),
    })
    const artifact = await store.putFile(
      {
        bytes: new TextEncoder().encode("private"),
        filename: "private.txt",
        mediaType: "text/plain",
        scope: "session:thread-1",
      },
      { id: "user-1" },
    )

    await expect(
      store.readContent(artifact.id, artifact.scope, { id: "user-2" }),
    ).rejects.toBeInstanceOf(ArtifactScopeAccessDeniedError)
    await expect(
      store.putFile({
        bytes: new TextEncoder().encode("anonymous"),
        filename: "anonymous.txt",
        mediaType: "text/plain",
        scope: "session:thread-1",
      }),
    ).rejects.toBeInstanceOf(ArtifactScopeAccessDeniedError)
  })
})
