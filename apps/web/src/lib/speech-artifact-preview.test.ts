import { mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { describe, expect, it } from "vitest"

import { createFileSessionArtifactStore } from "@workspace/artifact-store/repository"
import type { SigilAuthSession } from "./auth/server"
import {
  readArtifactPreview,
  type ArtifactAccessDependencies,
} from "./artifacts.server"

// Audio artifacts produced by sigil-synthesize-speech have to reach the browser
// as a playable kind. Before this, an audio media type fell through to
// "binary", whose UI says there is no in-app preview.
const session = { user: { id: "user-1", role: "member" } } as SigilAuthSession

async function storeWith(mediaType: string, filename: string) {
  const store = createFileSessionArtifactStore({
    root: await mkdtemp(join(tmpdir(), "sigil-speech-preview-")),
  })
  const artifact = await store.putFile({
    bytes: new Uint8Array([0x49, 0x44, 0x33, 0x04]),
    filename,
    mediaType,
    scope: "session:thread-1",
  })
  return { store, artifact }
}

function dependencies(
  store: Awaited<ReturnType<typeof storeWith>>["store"],
): ArtifactAccessDependencies {
  return {
    getSession: () => Promise.resolve(session),
    ownedThreadHomeScope: (userId, threadId) =>
      userId === "user-1" && threadId === "thread-1"
        ? "personal-scope:user-1"
        : undefined,
    store,
  }
}

describe("audio artifact preview", () => {
  it("classifies synthesized speech as playable audio, not opaque binary", async () => {
    const { store, artifact } = await storeWith("audio/mpeg", "speech.mp3")

    const preview = await readArtifactPreview(
      { id: artifact.id, scope: "session:thread-1" },
      dependencies(store),
    )

    expect(preview).toEqual({ kind: "audio", mediaType: "audio/mpeg" })
  })

  it("classifies every format the speech tool can request as audio", async () => {
    for (const mediaType of [
      "audio/mpeg",
      "audio/wav",
      "audio/opus",
      "audio/aac",
      "audio/flac",
      "audio/pcm",
    ]) {
      const { store, artifact } = await storeWith(mediaType, "speech.bin")
      const preview = await readArtifactPreview(
        { id: artifact.id, scope: "session:thread-1" },
        dependencies(store),
      )
      expect(preview).toMatchObject({ kind: "audio", mediaType })
    }
  })
})
