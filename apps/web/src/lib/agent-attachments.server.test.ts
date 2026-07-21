import { describe, expect, it, vi } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import { AGENT_SCOPE_HEADER } from "./agent-session-scope"
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
    fetcher: vi.fn(() =>
      Promise.resolve(
        Response.json({
          key: "artifact-key",
          mediaType: "image/png",
          size: 5,
          url: "/api/media/artifact?key=artifact-key&scope=session%3Athread-1",
        }),
      ),
    ),
    getSession: () => Promise.resolve(memberSession),
    ownedThreadHomeScope: (userId, threadId) =>
      userId === "user-1" && threadId === "thread-1"
        ? "personal-scope:user-1"
        : undefined,
    readEnvironment: () => ({
      apiKey: "service-key",
      gonkMcpUrl: "https://tools.example.test/mcp",
    }),
    ...overrides,
  }
}

describe("attachment upload authorization", () => {
  it("denies anonymous uploads before contacting Gonk", async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      uploadAgentAttachment(
        uploadData("session:thread-1"),
        dependencies({ fetcher, getSession: () => Promise.resolve(null) }),
      ),
    ).rejects.toMatchObject({ status: 401 })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("denies uploads into another user's session", async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(
      uploadAgentAttachment(
        uploadData("session:thread-2"),
        dependencies({ fetcher }),
      ),
    ).rejects.toThrow("not found")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("denies unavailable project and persona scopes", async () => {
    const fetcher = vi.fn<typeof fetch>()
    for (const scope of ["project:other", "persona:any"]) {
      await expect(
        uploadAgentAttachment(uploadData(scope), dependencies({ fetcher })),
      ).rejects.toThrow("not available")
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("uploads an owned session attachment with the service credential", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({
          key: "artifact-key",
          mediaType: "image/png",
          size: 5,
          url: "/api/media/artifact?key=artifact-key&scope=session%3Athread-1",
        }),
      ),
    )
    await expect(
      uploadAgentAttachment(
        uploadData("session:thread-1"),
        dependencies({ fetcher }),
      ),
    ).resolves.toMatchObject({ key: "artifact-key" })
    expect(fetcher).toHaveBeenCalledOnce()
    const [, init] = fetcher.mock.calls[0]!
    expect(new Headers(init?.headers).get(AGENT_SCOPE_HEADER)).toBe(
      "session:thread-1",
    )
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer service-key",
    )
  })
})
