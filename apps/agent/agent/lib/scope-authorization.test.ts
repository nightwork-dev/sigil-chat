import {
  issueScopeDelegation,
  readScopeDelegation,
} from "@workspace/agent-contracts/scope-delegation.server"
import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { ProjectRegistry } from "./project-registry"
import {
  bindScopeDelegationToActorSession,
  canReadMemorySource,
  createScopeGrantPolicy,
  requireAuthorizedResourceScope,
} from "./scope-authorization"
import { WorkspaceRegistry } from "./workspace-registry"

const SECRET = "test-only-scope-authorization-secret"

function request(scope: string, subject: string, secret = SECRET) {
  const expiresAt = Math.floor(Date.now() / 1_000) + 60
  const proof = issueScopeDelegation({ expiresAt, scope, subject }, secret)
  return new Request("http://agent.test", {
    headers: { "x-sigil-scope": scope, "x-sigil-scope-proof": proof },
  })
}

function registries(): {
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

describe("Eve resource-scope authorization", () => {
  it("binds a verified browser proof to Eve's trusted continuation session", () => {
    const expiresAt = Math.floor(Date.now() / 1_000) + 60
    const proof = issueScopeDelegation(
      {
        expiresAt,
        scope: "workspace:workspace-1",
        subject: "user-1",
      },
      SECRET,
    )

    const delegated = bindScopeDelegationToActorSession({
      actorSessionId: "eve-session-1",
      principalId: "user-1",
      proof,
      resourceScope: "workspace:workspace-1",
      secret: SECRET,
    })

    expect(delegated).toBeTruthy()
    expect(
      readScopeDelegation(delegated!, expiresAt - 1, SECRET),
    ).toMatchObject({
      actorSessionId: "eve-session-1",
      expiresAt,
      scope: "workspace:workspace-1",
      subject: "user-1",
    })
    expect(
      bindScopeDelegationToActorSession({
        actorSessionId: "eve-session-1",
        principalId: "user-2",
        proof,
        resourceScope: "workspace:workspace-1",
        secret: SECRET,
      }),
    ).toBeUndefined()

    expect(
      bindScopeDelegationToActorSession({
        actorSessionId: "eve-session-2",
        principalId: "user-1",
        proof: delegated,
        resourceScope: "workspace:workspace-1",
        secret: SECRET,
      }),
    ).toBeUndefined()
  })

  it("accepts an exact signed principal and scope binding", () => {
    expect(
      requireAuthorizedResourceScope({
        principalId: "user-1",
        request: request("session:thread-1", "user-1"),
        secret: SECRET,
      }),
    ).toBe("session:thread-1")
  })

  it("rejects cross-principal and cross-scope replay", () => {
    const authorized = request("session:thread-1", "user-1")
    expect(() =>
      requireAuthorizedResourceScope({
        principalId: "user-2",
        request: authorized,
        secret: SECRET,
      }),
    ).toThrow("NOT_AUTHORIZED")

    const headers = new Headers(authorized.headers)
    headers.set("x-sigil-scope", "session:thread-2")
    expect(() =>
      requireAuthorizedResourceScope({
        principalId: "user-1",
        request: new Request("http://agent.test", { headers }),
        secret: SECRET,
      }),
    ).toThrow("NOT_AUTHORIZED")
  })

  it("allows a registered project member and rejects a non-member", () => {
    const stores = registries()
    stores.projects.upsert({
      id: "project-1",
      name: "Project One",
      description: "A registered project.",
      members: [{ principalId: "user-member", role: "member" }],
      settings: {},
      createdAt: "2026-07-20T12:00:00.000Z",
      createdBy: "user-member",
    })

    expect(
      requireAuthorizedResourceScope({
        principalId: "user-member",
        request: request("project:project-1", "user-member"),
        secret: SECRET,
        registries: stores,
      }),
    ).toBe("project:project-1")
    expect(() =>
      requireAuthorizedResourceScope({
        principalId: "user-outsider",
        request: request("project:project-1", "user-outsider"),
        secret: SECRET,
        registries: stores,
      }),
    ).toThrow("NOT_AUTHORIZED")
  })

  it("uses a workspace's parent-project membership", () => {
    const stores = registries()
    stores.projects.upsert({
      id: "project-1",
      name: "Project One",
      description: "A registered project.",
      members: [{ principalId: "user-member", role: "owner" }],
      settings: {},
      createdAt: "2026-07-20T12:00:00.000Z",
      createdBy: "user-member",
    })
    stores.workspaces.upsert({
      id: "workspace-1",
      projectId: "project-1",
      name: "Workspace One",
      description: "A registered workspace.",
      status: "active",
      createdAt: "2026-07-20T12:00:00.000Z",
      createdBy: "user-member",
    })

    expect(
      requireAuthorizedResourceScope({
        principalId: "user-member",
        request: request("workspace:workspace-1", "user-member"),
        secret: SECRET,
        registries: stores,
      }),
    ).toBe("workspace:workspace-1")
  })

  it("honors an explicit workspace grant without granting its canonical project", () => {
    const stores = registries()
    stores.projects.upsert({
      id: "project-home",
      name: "Home project",
      description: "The workspace's canonical home.",
      members: [{ principalId: "user-owner", role: "owner" }],
      settings: {},
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-owner",
    })
    stores.workspaces.upsert({
      id: "workspace-shared",
      projectId: "project-home",
      name: "Shared workspace",
      description: "Mounted elsewhere without changing its home.",
      status: "active",
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-owner",
    })
    let grants = [
      {
        actions: ["read", "tool"] as const,
        principalId: "user-grantee",
        resourceScope: "workspace:workspace-shared",
      },
    ]
    const policy = createScopeGrantPolicy({
      grants: () => grants,
      registries: stores,
    })

    expect(
      policy.authorize({
        action: "read",
        principalId: "user-grantee",
        resourceScope: "workspace:workspace-shared",
      }),
    ).toBe(true)
    expect(
      policy.authorize({
        action: "read",
        principalId: "user-grantee",
        resourceScope: "project:project-home",
      }),
    ).toBe(false)

    grants = []
    expect(
      policy.authorize({
        action: "tool",
        principalId: "user-grantee",
        resourceScope: "workspace:workspace-shared",
      }),
    ).toBe(false)
  })

  it("rejects an unregistered project scope even with a valid proof", () => {
    expect(() =>
      requireAuthorizedResourceScope({
        principalId: "user-1",
        request: request("project:missing-project", "user-1"),
        secret: SECRET,
        registries: registries(),
      }),
    ).toThrow("NOT_AUTHORIZED")
  })

  it("authorizes memory sources against their live canonical container", () => {
    const stores = registries()
    stores.projects.upsert({
      id: "project-1",
      name: "Project One",
      description: "A registered project.",
      members: [{ principalId: "user-member", role: "member" }],
      settings: {},
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-member",
    })
    stores.workspaces.upsert({
      id: "workspace-1",
      projectId: "project-1",
      name: "Workspace One",
      description: "A registered workspace.",
      status: "active",
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-member",
    })

    expect(
      canReadMemorySource({
        principalId: "user-member",
        source: { scopeId: "workspace-1", resourceKey: "doc:launch" },
        registries: stores,
      }),
    ).toBe(true)
    expect(
      canReadMemorySource({
        principalId: "user-outsider",
        source: { scopeId: "workspace-1", resourceKey: "doc:launch" },
        registries: stores,
      }),
    ).toBe(false)
    expect(
      canReadMemorySource({
        principalId: "user-member",
        source: { scopeId: "missing-workspace" },
        registries: stores,
      }),
    ).toBe(false)
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
