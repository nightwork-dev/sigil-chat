import type { KvStore } from "@gonk/store/types"
import { SCOPE_AUTHORIZATION_ACTIONS } from "@workspace/agent-contracts/scope-authorization"
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

  // The registry's action validator must track the CONTRACT union, not its own
  // literal list — "write" was silently rejected for a day because the union
  // grew (SC.9) and a repeated literal list here did not.
  it.each(SCOPE_AUTHORIZATION_ACTIONS)(
    "accepts a grant naming the contract action %s",
    (action) => {
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
      const grants = new ScopeGrantRegistry({
        scopes: new ProjectWorkspaceScopeRegistry(projects, workspaces),
        store: memoryKv(new Map()),
      })

      const grant = grants.create({
        actions: [action],
        createdBy: "user-owner",
        principalId: "user-grantee",
        resourceScope: "project:project-home",
      })
      expect(grant.actions).toEqual([action])
    },
  )

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
