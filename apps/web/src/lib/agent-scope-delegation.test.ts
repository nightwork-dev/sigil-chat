import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { ProjectRegistry } from "../../../agent/agent/lib/project-registry"
import { WorkspaceRegistry } from "../../../agent/agent/lib/workspace-registry"
import { assertAuthorizedScope } from "./agent-scope-authorization.server"

describe("agent scope authorization", () => {
  it("requires a session scope to belong to the authenticated user", () => {
    const ownsThread = (userId: string, threadId: string) =>
      userId === "user-1" && threadId === "thread-1"

    expect(() =>
      assertAuthorizedScope("session:thread-1", "user-1", ownsThread),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope("session:thread-1", "user-2", ownsThread),
    ).toThrow("not found")
  })

  it("rejects malformed scope strings", () => {
    expect(() =>
      assertAuthorizedScope("session:", "user-1", () => true),
    ).toThrow("invalid")
    expect(() =>
      assertAuthorizedScope("global:anything", "user-1", () => true),
    ).toThrow("invalid")
  })

  it("issues registered project and workspace scopes only to members", () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    const workspaces = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map()),
    })
    projects.upsert({
      id: "project-1",
      name: "Project One",
      description: "A registered project.",
      members: [{ principalId: "user-member", role: "member" }],
      settings: {},
      createdAt: "2026-07-20T12:00:00.000Z",
      createdBy: "user-member",
    })
    workspaces.upsert({
      id: "workspace-1",
      projectId: "project-1",
      name: "Workspace One",
      description: "A registered workspace.",
      status: "active",
      createdAt: "2026-07-20T12:00:00.000Z",
      createdBy: "user-member",
    })
    const registries = { projects, workspaces }

    expect(() =>
      assertAuthorizedScope(
        "project:project-1",
        "user-member",
        () => false,
        registries,
      ),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope(
        "workspace:workspace-1",
        "user-member",
        () => false,
        registries,
      ),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope(
        "project:project-1",
        "user-outsider",
        () => false,
        registries,
      ),
    ).toThrow("NOT_AUTHORIZED")
  })

  it("preserves the unregistered evidence-room scope and rejects other legacy scopes", () => {
    expect(() =>
      assertAuthorizedScope("project:evidence-room", "user-1", () => false),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope("project:other", "user-1", () => false),
    ).toThrow("not available")
    expect(() =>
      assertAuthorizedScope("persona:any", "user-1", () => false),
    ).toThrow("not available")
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
