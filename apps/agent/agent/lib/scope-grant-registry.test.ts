import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { ProjectRegistry } from "./project-registry"
import { ScopeGrantRegistry } from "./scope-grant-registry"
import { ProjectWorkspaceScopeRegistry } from "./scope-registry"
import { WorkspaceRegistry } from "./workspace-registry"

describe("ScopeGrantRegistry", () => {
  it("persists exact resource grants and removes them from active reads on revocation", () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    projects.upsert({
      id: "project-home",
      name: "Home project",
      description: "Canonical home.",
      members: [{ principalId: "user-owner", role: "owner" }],
      settings: {},
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-owner",
    })
    const workspaces = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map()),
    })
    workspaces.upsert({
      id: "workspace-shared",
      projectId: "project-home",
      homeScopeId: "project-home",
      name: "Shared workspace",
      description: "Directly granted workspace.",
      status: "active",
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-owner",
    })
    const grants = new ScopeGrantRegistry({
      createId: () => "grant-1",
      now: () => new Date("2026-07-21T12:00:00.000Z"),
      scopes: new ProjectWorkspaceScopeRegistry(projects, workspaces),
      store: memoryKv(new Map()),
    })

    const grant = grants.create({
      actions: ["read", "tool"],
      createdBy: "user-owner",
      principalId: "user-grantee",
      resourceScope: "workspace:workspace-shared",
    })
    expect(grants.listActive()).toEqual([grant])

    const revoked = grants.revoke(grant.id, "user-owner")
    expect(revoked.revision).toBe(2)
    expect(grants.listActive()).toEqual([])
    expect(grants.list()).toEqual([revoked])
  })

  it("rejects a grant for a non-existent resource identity", () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    const workspaces = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map()),
    })
    const grants = new ScopeGrantRegistry({
      scopes: new ProjectWorkspaceScopeRegistry(projects, workspaces),
      store: memoryKv(new Map()),
    })

    expect(() =>
      grants.create({
        actions: ["read"],
        createdBy: "user-owner",
        principalId: "user-grantee",
        resourceScope: "workspace:missing",
      }),
    ).toThrow("Unknown scope grant resource")
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
