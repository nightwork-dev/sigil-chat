import { mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { describe, expect, it } from "vitest"

import {
  ArtifactScopeAccessDeniedError,
  createFileSessionArtifactStore,
  SessionArtifactStore,
} from "../src/repository"
import { formatScopeHeader } from "../src/scope"

describe("SessionArtifactStore", () => {
  it("persists manifest metadata and bytes across repository instances", async () => {
    const root = await mkdtemp(join(tmpdir(), "sigil-artifacts-"))
    const scope = "session:thread-1"
    const firstProcess = createFileSessionArtifactStore({ root })

    const stored = await firstProcess.putFile({
      bytes: new TextEncoder().encode("hello artifact"),
      filename: "hello.txt",
      mediaType: "text/plain",
      scope,
    })

    const afterRestart = createFileSessionArtifactStore({ root })
    await expect(afterRestart.listByScope(scope)).resolves.toMatchObject([
      {
        id: stored.id,
        filename: "hello.txt",
        mediaType: "text/plain",
        scope: { tier: "session", id: "thread-1" },
      },
    ])
    await expect(afterRestart.readContent(stored.id, scope)).resolves.toEqual({
      bytes: new TextEncoder().encode("hello artifact"),
      mediaType: "text/plain",
    })
  })

  it("serializes concurrent writes across repository instances sharing one root", async () => {
    const root = await mkdtemp(join(tmpdir(), "sigil-artifacts-"))
    const scope = "workspace:launch"
    const stores = [
      createFileSessionArtifactStore({ root }),
      createFileSessionArtifactStore({ root }),
    ]

    const written = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        stores[index % stores.length]!.putFile({
          bytes: new TextEncoder().encode(`artifact-${index}`),
          filename: `artifact-${index}.txt`,
          mediaType: "text/plain",
          scope,
        }),
      ),
    )

    const listed = await createFileSessionArtifactStore({ root }).listByScope(
      scope,
    )
    expect(listed).toHaveLength(written.length)
    expect(new Set(listed.map((artifact) => artifact.id))).toEqual(
      new Set(written.map((artifact) => artifact.id)),
    )
  })

  it("deduplicates identical bytes inside a scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "sigil-artifacts-"))
    const store = createFileSessionArtifactStore({ root })
    const input = {
      bytes: new TextEncoder().encode("same"),
      filename: "same.txt",
      mediaType: "text/plain",
      scope: "session:thread-1",
    }

    const first = await store.putFile(input)
    const second = await store.putFile(input)

    expect(second).toEqual(first)
    await expect(store.listByScope(input.scope)).resolves.toHaveLength(1)
  })

  it("keeps authorization policy separate from scope location", async () => {
    const root = await mkdtemp(join(tmpdir(), "sigil-artifacts-"))
    const seed = createFileSessionArtifactStore({ root })
    const stored = await seed.putFile({
      bytes: new TextEncoder().encode("private"),
      filename: "private.txt",
      mediaType: "text/plain",
      scope: "workspace:holiday-launch",
    })
    const secured = createFileSessionArtifactStore({
      root,
      canAccessScope: (principal, scope) =>
        principal?.id === "owner" &&
        formatScopeHeader(scope) === "workspace:holiday-launch",
    })

    await expect(
      secured.readContent(stored.id, "workspace:holiday-launch", {
        id: "owner",
      }),
    ).resolves.toMatchObject({ mediaType: "text/plain" })
    await expect(
      secured.readContent(stored.id, "workspace:holiday-launch", {
        id: "intruder",
      }),
    ).rejects.toBeInstanceOf(ArtifactScopeAccessDeniedError)
  })

  it("supports generic object stores without a filesystem lock root", async () => {
    const { InMemoryObjectStore } = await import("@mirk/artifact")
    const store = new SessionArtifactStore(new InMemoryObjectStore())
    const stored = await store.putFile({
      bytes: new TextEncoder().encode("memory"),
      filename: "memory.txt",
      mediaType: "text/plain",
      scope: "project:evidence-room",
    })

    await expect(store.readContent(stored.id, stored.scope)).resolves.toEqual({
      bytes: new TextEncoder().encode("memory"),
      mediaType: "text/plain",
    })
  })
})
