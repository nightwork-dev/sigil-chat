import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { ProjectRegistry } from "./project-registry"
import {
  containerHome,
  createSigilScopedKnowledgeAuthority,
  createSigilScopedKnowledgeStore,
} from "./scoped-knowledge"
import { WorkspaceRegistry } from "./workspace-registry"

describe("Sigil scoped knowledge adapter", () => {
  it("reads workspace knowledge through the active workspace and parent project membership", async () => {
    const registries = createRegistries()
    seedProject(registries.projects, {
      id: "project-1",
      principalId: "user-owner",
      role: "owner",
    })
    seedWorkspace(registries, "workspace-1", "project-1")

    const authority = createSigilScopedKnowledgeAuthority(registries)

    expect(
      await authority.authorizeRead({
        principal: { principalId: "user-owner" },
        container: { tier: "workspace", id: "workspace-1" },
      }),
    ).toMatchObject({ allowed: true, role: "owner" })
    expect(await authority.resolveWorkspaceParentProject("workspace-1")).toBe(
      "project-1",
    )
  })

  it("allows owners to write and keeps ordinary members read-only viewers", async () => {
    const registries = createRegistries()
    seedProject(registries.projects, {
      id: "project-1",
      principalId: "user-owner",
      role: "owner",
    })
    registries.projects.upsert({
      ...registries.projects.get("project-1")!,
      members: [
        { principalId: "user-owner", role: "owner" },
        { principalId: "user-member", role: "member" },
      ],
    })
    seedWorkspace(registries, "workspace-1", "project-1")
    const authority = createSigilScopedKnowledgeAuthority(registries)

    expect(
      await authority.authorizeWrite({
        principal: { principalId: "user-owner" },
        container: { tier: "workspace", id: "workspace-1" },
      }),
    ).toMatchObject({ allowed: true, role: "owner" })
    expect(
      await authority.authorizeWrite({
        principal: { principalId: "user-member" },
        container: { tier: "workspace", id: "workspace-1" },
      }),
    ).toMatchObject({
      allowed: false,
      role: "viewer",
      reason: "scoped knowledge writes require project ownership",
    })
  })

  it("stores encoded container homes under the configured root and rejects unsupported tiers", () => {
    const root = "/tmp/sigil-knowledge-root"

    expect(
      containerHome(root, { tier: "workspace", id: "../escape" }),
    ).toBe("/tmp/sigil-knowledge-root/workspace/..%2Fescape")
    expect(
      containerHome(root, { tier: "project", id: "safe..id" }),
    ).toBe("/tmp/sigil-knowledge-root/project/safe..id")
    expect(
      containerHome(root, { tier: "session", id: "thread-1" } as never),
    ).toBeUndefined()
  })

  it("fails closed with a blocked write receipt when the application scanner rejects text", async () => {
    const registries = createRegistries()
    seedProject(registries.projects, {
      id: "project-1",
      principalId: "user-owner",
      role: "owner",
    })
    const store = createSigilScopedKnowledgeStore({
      registries,
      rootDir: "/tmp/sigil-knowledge-test",
      scanWrites: (text) =>
        text.includes("javascript:")
          ? { allowed: false, reason: "scanner denied test text" }
          : { allowed: true },
    })

    const result = await store.write({
      principal: { principalId: "user-owner" },
      targetContainer: { tier: "project", id: "project-1" },
      id: "unsafe",
      title: "Unsafe",
      body: "javascript:alert(1)",
      category: "reference",
      expectedRevision: 0,
    })
    store.close()

    expect(result.page).toBeUndefined()
    expect(result.receipt).toMatchObject({
      outcome: "blocked",
      reason: "scanner denied test text",
    })
  })
})

function createRegistries(): {
  projects: ProjectRegistry
  workspaces: WorkspaceRegistry
} {
  const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
  const workspaces = new WorkspaceRegistry({
    projects,
    store: memoryKv(new Map()),
  })
  return { projects, workspaces }
}

function seedProject(
  projects: ProjectRegistry,
  input: { id: string; principalId: string; role: "owner" | "member" },
): void {
  projects.upsert({
    id: input.id,
    name: input.id,
    description: "Test project.",
    members: [{ principalId: input.principalId, role: input.role }],
    settings: {},
    createdAt: "2026-08-01T00:00:00.000Z",
    createdBy: input.principalId,
  })
}

function seedWorkspace(
  registries: { projects: ProjectRegistry; workspaces: WorkspaceRegistry },
  id: string,
  projectId: string,
): void {
  registries.workspaces.upsert({
    id,
    projectId,
    name: id,
    description: "Test workspace.",
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    createdBy: "user-owner",
  })
}

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
