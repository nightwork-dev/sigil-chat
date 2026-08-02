import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { AuthContext } from "@gonk/auth"
import type { KvStore } from "@gonk/store/types"
import {
  collectToolOutcome,
  makeBaseContext,
  ToolRegistry,
} from "@gonk/tool-registry"
import { afterEach, describe, expect, it } from "vitest"

import { ProjectRegistry } from "./project-registry"
import {
  containerHome,
  createSigilScopedKnowledgeAuthority,
  createSigilScopedKnowledgeStore,
  createSigilScopedKnowledgeTools,
} from "./scoped-knowledge"
import { WorkspaceRegistry } from "./workspace-registry"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

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

  it("binds knowledge reads to the active host scope even when the principal owns another project", async () => {
    const registries = createRegistries()
    seedProject(registries.projects, {
      id: "project-a",
      principalId: "user-owner",
      role: "owner",
    })
    seedProject(registries.projects, {
      id: "project-b",
      principalId: "user-owner",
      role: "owner",
    })
    const rootDir = await tempDirectory("sigil-knowledge-cross-read-")
    const store = createSigilScopedKnowledgeStore({
      registries,
      rootDir,
      scanWrites: () => ({ allowed: true }),
    })
    const registry = registryWithScopedKnowledgeTools(store)

    await store.write({
      principal: { principalId: "user-owner" },
      targetContainer: { tier: "project", id: "project-b" },
      id: "project-b-secret",
      title: "Project B Secret",
      body: "Project B contains the cinder lantern instructions.",
      category: "reference",
      expectedRevision: 0,
    })

    const outcome = await collectToolOutcome(
      registry.invoke(
        "scoped_knowledge_query",
        { text: "cinder lantern" },
        makeBaseContext({
          auth: humanAuth("user-owner", "project:project-a"),
          host: { resourceScope: "project:project-a" },
        }),
      ),
    )
    store.close()

    expect(outcome).toMatchObject({
      ok: true,
      data: {
        results: [],
        receipt: {
          activeContainer: { tier: "project", id: "project-a" },
          resolvedContainers: [{ tier: "project", id: "project-a" }],
          queriedContainers: [{ tier: "project", id: "project-a" }],
        },
      },
    })
    expect(JSON.stringify(outcome)).not.toContain("project-b")
    expect(JSON.stringify(outcome)).not.toContain("cinder lantern")
  })

  it("binds writes to the active host scope and rejects model-selected target containers", async () => {
    const registries = createRegistries()
    seedProject(registries.projects, {
      id: "project-a",
      principalId: "user-owner",
      role: "owner",
    })
    seedProject(registries.projects, {
      id: "project-b",
      principalId: "user-owner",
      role: "owner",
    })
    const rootDir = await tempDirectory("sigil-knowledge-cross-write-")
    const store = createSigilScopedKnowledgeStore({
      registries,
      rootDir,
      scanWrites: () => ({ allowed: true }),
    })
    const registry = registryWithScopedKnowledgeTools(store)
    const context = makeBaseContext({
      auth: humanAuth("user-owner", "project:project-a"),
      host: { resourceScope: "project:project-a" },
    })

    const targeted = await collectToolOutcome(
      registry.invoke(
        "scoped_knowledge_write",
        {
          targetContainer: { tier: "project", id: "project-b" },
          id: "attempted-cross-write",
          title: "Attempted cross write",
          body: "This must not be written to project B.",
          category: "reference",
          expectedRevision: 0,
        },
        context,
      ),
    )
    expect(targeted).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
      message: "Input validation failed",
    })

    const written = await collectToolOutcome(
      registry.invoke(
        "scoped_knowledge_write",
        {
          id: "active-project-note",
          title: "Active project note",
          body: "This writes only to the active project.",
          category: "reference",
          expectedRevision: 0,
        },
        context,
      ),
    )

    const projectA = await store.query({
      principal: { principalId: "user-owner" },
      activeContainer: { tier: "project", id: "project-a" },
      text: "active project",
    })
    const projectB = await store.query({
      principal: { principalId: "user-owner" },
      activeContainer: { tier: "project", id: "project-b" },
      text: "active project",
    })
    store.close()

    expect(written).toMatchObject({
      ok: true,
      data: {
        page: {
          id: "active-project-note",
          container: { tier: "project", id: "project-a" },
        },
        receipt: {
          targetContainer: { tier: "project", id: "project-a" },
        },
      },
    })
    expect(projectA.results).toHaveLength(1)
    expect(projectB.results).toHaveLength(0)
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

async function tempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

function registryWithScopedKnowledgeTools(
  store: ReturnType<typeof createSigilScopedKnowledgeStore>,
): ToolRegistry {
  const registry = new ToolRegistry({
    security: {
      approvalProvider: {
        decide: () => ({ outcome: "approved", reason: "test approval" }),
      },
    },
  })
  for (const tool of createSigilScopedKnowledgeTools(store)) {
    registry.register(tool)
  }
  return registry
}

function humanAuth(principalId: string, scope: string): AuthContext {
  return {
    principal: {
      id: principalId,
      kind: "human" as const,
      identity: {
        issuer: "sigil:test",
        subject: principalId,
        method: "custom:scope-delegation" as const,
      },
      roles: ["member"],
      scopes: [scope],
    },
    authorize: () => ({ outcome: "allow" as const, reason: "test policy" }),
  }
}
