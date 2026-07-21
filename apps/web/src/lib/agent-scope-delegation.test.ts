import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { ProjectRegistry } from "../../../agent/agent/lib/project-registry"
import { ScopeGrantRegistry } from "../../../agent/agent/lib/scope-grant-registry"
import { ProjectWorkspaceScopeRegistry } from "../../../agent/agent/lib/scope-registry"
import { WorkspaceRegistry } from "../../../agent/agent/lib/workspace-registry"
import { assertAuthorizedScope } from "./agent-scope-authorization.server"

describe("agent scope authorization", () => {
  const emptyRegistries = () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    return {
      projects,
      workspaces: new WorkspaceRegistry({
        projects,
        store: memoryKv(new Map()),
      }),
    }
  }

  it("requires a session scope to belong to the authenticated user", () => {
    const ownsThread = (userId: string, threadId: string) =>
      userId === "user-1" && threadId === "thread-1"
        ? "personal-scope:user-1"
        : undefined

    expect(() =>
      assertAuthorizedScope(
        "session:thread-1",
        "user-1",
        ownsThread,
        emptyRegistries(),
      ),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope(
        "session:thread-1",
        "user-2",
        ownsThread,
        emptyRegistries(),
      ),
    ).toThrow("not found")
  })

  it("revokes a workspace-homed session when access to its live home is removed", () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    const workspaces = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map()),
    })
    const project = {
      id: "project-home",
      name: "Project home",
      description: "Session authorization root.",
      members: [{ principalId: "user-1", role: "member" as const }],
      settings: {},
      createdAt: "2026-07-21T00:00:00.000Z",
      createdBy: "user-1",
    }
    projects.upsert(project)
    workspaces.upsert({
      id: "workspace-home",
      projectId: project.id,
      name: "Workspace home",
      description: "Session home.",
      status: "active",
      createdAt: project.createdAt,
      createdBy: project.createdBy,
    })
    const registries = { projects, workspaces }
    const homeScope = () => "workspace-home"

    expect(() =>
      assertAuthorizedScope(
        "session:thread-1",
        "user-1",
        homeScope,
        registries,
      ),
    ).not.toThrow()

    projects.upsert({ ...project, members: [] })
    expect(() =>
      assertAuthorizedScope(
        "session:thread-1",
        "user-1",
        homeScope,
        registries,
      ),
    ).toThrow("NOT_AUTHORIZED")

    expect(() =>
      assertAuthorizedScope(
        "session:personal-thread",
        "user-1",
        () => "personal-scope:user-1",
        registries,
      ),
    ).not.toThrow()
  })

  it("rejects malformed scope strings", () => {
    expect(() =>
      assertAuthorizedScope(
        "session:",
        "user-1",
        () => "personal-scope:user-1",
        emptyRegistries(),
      ),
    ).toThrow("invalid")
    expect(() =>
      assertAuthorizedScope(
        "global:anything",
        "user-1",
        () => "personal-scope:user-1",
        emptyRegistries(),
      ),
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
        () => undefined,
        registries,
      ),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope(
        "workspace:workspace-1",
        "user-member",
        () => undefined,
        registries,
      ),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope(
        "project:project-1",
        "user-outsider",
        () => undefined,
        registries,
      ),
    ).toThrow("NOT_AUTHORIZED")
    expect(() =>
      assertAuthorizedScope(
        "workspace:workspace-1",
        "user-outsider",
        () => false,
        registries,
      ),
    ).toThrow("NOT_AUTHORIZED")
  })

  it("can issue a workspace proof from an explicit resource grant without granting its home project", () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    const workspaces = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map()),
    })
    projects.upsert({
      id: "project-home",
      name: "Home project",
      description: "Canonical workspace home.",
      members: [{ principalId: "user-owner", role: "owner" }],
      settings: {},
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-owner",
    })
    workspaces.upsert({
      id: "workspace-shared",
      projectId: "project-home",
      name: "Shared workspace",
      description: "Directly granted resource.",
      status: "active",
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-owner",
    })
    const grants = new ScopeGrantRegistry({
      scopes: new ProjectWorkspaceScopeRegistry(projects, workspaces),
      store: memoryKv(new Map()),
    })
    const grant = grants.create({
      actions: ["read", "tool"],
      createdBy: "user-owner",
      principalId: "user-grantee",
      resourceScope: "workspace:workspace-shared",
    })
    const registries = { grants, projects, workspaces }

    expect(() =>
      assertAuthorizedScope(
        "workspace:workspace-shared",
        "user-grantee",
        () => undefined,
        registries,
      ),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope(
        "project:project-home",
        "user-grantee",
        () => undefined,
        registries,
      ),
    ).toThrow("NOT_AUTHORIZED")

    grants.revoke(grant.id, "user-owner")
    expect(() =>
      assertAuthorizedScope(
        "workspace:workspace-shared",
        "user-grantee",
        () => undefined,
        registries,
      ),
    ).toThrow("NOT_AUTHORIZED")
  })

  it("keeps read and tool grants at their respective web boundaries", () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    const workspaces = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map()),
    })
    projects.upsert({
      id: "project-home",
      name: "Home project",
      description: "Canonical workspace home.",
      members: [{ principalId: "user-owner", role: "owner" }],
      settings: {},
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-owner",
    })
    workspaces.upsert({
      id: "workspace-shared",
      projectId: "project-home",
      name: "Shared workspace",
      description: "Directly granted resource.",
      status: "active",
      createdAt: "2026-07-21T12:00:00.000Z",
      createdBy: "user-owner",
    })
    const grants = new ScopeGrantRegistry({
      scopes: new ProjectWorkspaceScopeRegistry(projects, workspaces),
      store: memoryKv(new Map()),
    })
    const registries = { grants, projects, workspaces }
    grants.create({
      actions: ["tool"],
      createdBy: "user-owner",
      principalId: "user-tool-only",
      resourceScope: "workspace:workspace-shared",
    })
    grants.create({
      actions: ["read"],
      createdBy: "user-owner",
      principalId: "user-read-only",
      resourceScope: "workspace:workspace-shared",
    })
    const assert = (principalId: string, action: "read" | "tool") =>
      assertAuthorizedScope(
        "workspace:workspace-shared",
        principalId,
        () => undefined,
        registries,
        undefined,
        action,
      )

    expect(() => assert("user-tool-only", "tool")).not.toThrow()
    expect(() => assert("user-tool-only", "read")).toThrow("NOT_AUTHORIZED")
    expect(() => assert("user-read-only", "read")).not.toThrow()
    expect(() => assert("user-read-only", "tool")).toThrow("NOT_AUTHORIZED")
  })

  it("preserves the unregistered evidence-room scope and rejects other legacy scopes", () => {
    expect(() =>
      assertAuthorizedScope(
        "project:evidence-room",
        "user-1",
        () => undefined,
        emptyRegistries(),
      ),
    ).not.toThrow()
    expect(() =>
      assertAuthorizedScope(
        "project:other",
        "user-1",
        () => undefined,
        emptyRegistries(),
      ),
    ).toThrow("not available")
    expect(() =>
      assertAuthorizedScope(
        "persona:any",
        "user-1",
        () => undefined,
        emptyRegistries(),
      ),
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
