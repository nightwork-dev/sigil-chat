import { mkdtemp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { describe, expect, it } from "vitest"

import { createFileSessionArtifactStore } from "../../../../packages/artifact-store/src/repository"
import type { SigilAuthSession } from "./auth/server"
import {
  uploadAgentAttachment,
  type AttachmentUploadDependencies,
} from "./agent-attachments.server"

const memberSession = {
  user: { id: "user-1", role: "member" },
} as SigilAuthSession

function uploadData(scope: string): FormData {
  const data = new FormData()
  data.set("scope", scope)
  data.set("file", new File(["image"], "image.png", { type: "image/png" }))
  return data
}

function dependencies(
  overrides: Partial<AttachmentUploadDependencies> = {},
): AttachmentUploadDependencies {
  return {
    getSession: () => Promise.resolve(memberSession),
    ownedThreadHomeScope: (userId, threadId) =>
      userId === "user-1" && threadId === "thread-1"
        ? "personal-scope:user-1"
        : undefined,
    ...overrides,
  }
}

async function uploadStore() {
  return createFileSessionArtifactStore({
    root: await mkdtemp(join(tmpdir(), "sigil-upload-artifacts-")),
  })
}

describe("attachment upload authorization", () => {
  it("denies anonymous uploads before writing artifacts", async () => {
    const store = await uploadStore()
    await expect(
      uploadAgentAttachment(
        uploadData("session:thread-1"),
        dependencies({ store, getSession: () => Promise.resolve(null) }),
      ),
    ).rejects.toMatchObject({ status: 401 })
    await expect(store.listByScope("session:thread-1")).resolves.toHaveLength(0)
  })

  it("denies uploads into another user's session", async () => {
    const store = await uploadStore()
    await expect(
      uploadAgentAttachment(
        uploadData("session:thread-2"),
        dependencies({ store }),
      ),
    ).rejects.toThrow("not found")
    await expect(store.listByScope("session:thread-2")).resolves.toHaveLength(0)
  })

  it("denies unavailable project and persona scopes", async () => {
    const store = await uploadStore()
    for (const scope of ["project:other", "persona:any"]) {
      await expect(
        uploadAgentAttachment(uploadData(scope), dependencies({ store })),
      ).rejects.toThrow("not available")
    }
    await expect(store.listByScope("project:other")).resolves.toHaveLength(0)
  })

  it("uploads an owned session attachment through the shared artifact store", async () => {
    const store = await uploadStore()
    const uploaded = await uploadAgentAttachment(
      uploadData("session:thread-1"),
      dependencies({ store }),
    )
    expect(uploaded).toMatchObject({
      mediaType: "image/png",
      size: 5,
      filename: "image.png",
    })
    expect(uploaded.url).toBe(
      `/api/media/artifact?key=${encodeURIComponent(uploaded.key)}&scope=session%3Athread-1`,
    )
    await expect(
      store.readContent(uploaded.key, "session:thread-1", { id: "user-1" }),
    ).resolves.toMatchObject({
      mediaType: "image/png",
    })
  })
})
