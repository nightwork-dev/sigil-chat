import { describe, expect, it } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import { AuthenticationRequiredError } from "./auth/session"
import {
  readOwnedBlackboard,
  requireBlackboardAccess,
  writeOwnedBlackboard,
} from "./blackboard.server"
import { MemoryBlackboardRepository } from "@workspace/blackboard-store"

function session(userId: string): SigilAuthSession {
  return { user: { id: userId } } as SigilAuthSession
}

describe("blackboard server boundary", () => {
  const ownsThread = (userId: string, threadId: string) =>
    userId === "user-1" && threadId === "thread-1"

  it("rejects anonymous access", () => {
    expect(() => requireBlackboardAccess(null, "thread-1", ownsThread)).toThrow(
      AuthenticationRequiredError,
    )
  })

  it("rejects a thread owned by another user", () => {
    expect(() =>
      requireBlackboardAccess(session("user-2"), "thread-1", ownsThread),
    ).toThrow("not found")
  })

  it("accepts the authenticated owner of the thread", () => {
    expect(
      requireBlackboardAccess(session("user-1"), "thread-1", ownsThread),
    ).toBeTruthy()
  })

  it("reads and writes only through the owned thread boundary", async () => {
    const blackboards = new MemoryBlackboardRepository(
      () => "2026-07-20T10:00:00.000Z",
    )
    const threads = { get: ownsThread }
    const owner = session("user-1")

    await expect(
      writeOwnedBlackboard(
        owner,
        { sessionId: "thread-1", content: "Shared", expectedRevision: "" },
        threads,
        blackboards,
      ),
    ).resolves.toMatchObject({ content: "Shared", updatedBy: "user" })
    await expect(
      readOwnedBlackboard(owner, "thread-1", threads, blackboards),
    ).resolves.toMatchObject({ content: "Shared" })
    await expect(
      readOwnedBlackboard(session("user-2"), "thread-1", threads, blackboards),
    ).rejects.toThrow("not found")
  })
})
