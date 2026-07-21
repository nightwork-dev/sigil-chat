import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import { AuthenticationRequiredError } from "./auth/session"
import {
  readOwnedBlackboard,
  readScopedBlackboard,
  requireBlackboardAccess,
  writeOwnedBlackboard,
  writeScopedBlackboard,
} from "./blackboard.server"
import { MemoryBlackboardRepository } from "@workspace/blackboard-store"
import { ProjectRegistry } from "../../../agent/agent/lib/project-registry"
import { WorkspaceRegistry } from "../../../agent/agent/lib/workspace-registry"

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

  it("gives a workspace's own scratch surface to registered members only, keyed separately from any thread", async () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    const workspaces = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map()),
    })
    projects.upsert({
      id: "project-1",
      name: "Project One",
      description: "",
      members: [{ principalId: "user-1", role: "owner" }],
      settings: {},
      createdAt: "2026-07-20T12:00:00.000Z",
      createdBy: "user-1",
    })
    workspaces.upsert({
      id: "workspace-1",
      projectId: "project-1",
      name: "Workspace One",
      description: "",
      status: "active",
      createdAt: "2026-07-20T12:00:00.000Z",
      createdBy: "user-1",
    })
    const registries = { projects, workspaces }
    const blackboards = new MemoryBlackboardRepository(
      () => "2026-07-20T10:00:00.000Z",
    )
    const scope = { tier: "workspace" as const, id: "workspace-1" }

    await expect(
      writeScopedBlackboard(
        session("user-1"),
        { scope, content: "Workspace scratch", expectedRevision: "" },
        ownsThread,
        blackboards,
        registries,
      ),
    ).resolves.toMatchObject({ content: "Workspace scratch" })
    await expect(
      readScopedBlackboard(session("user-1"), scope, ownsThread, blackboards, registries),
    ).resolves.toMatchObject({ content: "Workspace scratch" })
    await expect(
      readScopedBlackboard(session("user-2"), scope, ownsThread, blackboards, registries),
    ).rejects.toThrow()
    // Reading the same id as a session tier hits a different store key —
    // the workspace note does not leak into a same-named session blackboard.
    await expect(
      readOwnedBlackboard(session("user-1"), "workspace-1", { get: () => true }, blackboards),
    ).resolves.toMatchObject({ content: "" })
  })

  it("refuses a session id shaped like a workspace key, even if a caller somehow owns a thread by that literal id", async () => {
    // Session ids are always crypto.randomUUID() in practice, so this
    // simulates that invariant slipping: a caller who genuinely owns a
    // thread literally named "workspace:foo" (thus passing the ownership
    // check) must still be refused, because reading it would otherwise
    // return workspace "foo"'s notes — the exact collision blackboardStoreKey
    // now rejects by construction.
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    const workspaces = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map()),
    })
    projects.upsert({
      id: "project-1",
      name: "Project One",
      description: "",
      members: [{ principalId: "user-1", role: "owner" }],
      settings: {},
      createdAt: "2026-07-20T12:00:00.000Z",
      createdBy: "user-1",
    })
    workspaces.upsert({
      id: "foo",
      projectId: "project-1",
      name: "Workspace Foo",
      description: "",
      status: "active",
      createdAt: "2026-07-20T12:00:00.000Z",
      createdBy: "user-1",
    })
    const registries = { projects, workspaces }
    const blackboards = new MemoryBlackboardRepository(
      () => "2026-07-20T10:00:00.000Z",
    )
    await writeScopedBlackboard(
      session("user-1"),
      {
        scope: { tier: "workspace", id: "foo" },
        content: "Workspace foo secret",
        expectedRevision: "",
      },
      () => false,
      blackboards,
      registries,
    )

    const ownsColonShapedThread = (userId: string, threadId: string) =>
      userId === "user-1" && threadId === "workspace:foo"

    await expect(
      readScopedBlackboard(
        session("user-1"),
        { tier: "session", id: "workspace:foo" },
        ownsColonShapedThread,
        blackboards,
        registries,
      ),
    ).rejects.toThrow('must not contain ":"')
  })
})

function memoryKv(values: Map<string, unknown>): KvStore<unknown> {
  return {
    delete: (key) => void values.delete(key),
    entries: (prefix = "") =>
      [...values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value })),
    get: (key) => values.get(key),
    list: (prefix = "") =>
      [...values.keys()].filter((key) => key.startsWith(prefix)),
    patch: () => {
      throw new Error("not implemented")
    },
    set: (key, value) => void values.set(key, value),
  }
}
