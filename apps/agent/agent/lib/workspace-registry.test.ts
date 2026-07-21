import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { KvStore } from "@gonk/store/types"
import { afterEach, describe, expect, it } from "vitest"

import { type Project, ProjectRegistry } from "./project-registry"
import { type Workspace, WorkspaceRegistry } from "./workspace-registry"

const temporaryDirectories: string[] = []

const project: Project = {
  id: "project-1",
  name: "Project One",
  description: "The containing project.",
  members: [{ principalId: "user-owner", role: "owner" }],
  settings: {},
  createdAt: "2026-07-20T12:00:00.000Z",
  createdBy: "user-owner",
}

const workspace: Workspace = {
  id: "workspace-1",
  projectId: project.id,
  homeScopeId: project.id,
  name: "Workspace One",
  description: "A focused effort.",
  status: "active",
  createdAt: "2026-07-20T12:00:00.000Z",
  createdBy: "user-owner",
}

const versionedWorkspace = { ...workspace, revision: 1 }

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

describe("WorkspaceRegistry", () => {
  it("persists workspaces through Mirk under an existing project", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-workspaces-"))
    temporaryDirectories.push(directory)
    const projects = new ProjectRegistry({
      cwd: directory,
      projectRoot: directory,
    })
    projects.upsert(project)
    const first = new WorkspaceRegistry({
      cwd: directory,
      projectRoot: directory,
      projects,
    })

    expect(first.upsert(workspace)).toEqual(versionedWorkspace)

    const reopened = new WorkspaceRegistry({
      cwd: directory,
      projectRoot: directory,
      projects: new ProjectRegistry({ cwd: directory, projectRoot: directory }),
    })
    expect(reopened.get("workspace-1")).toEqual(versionedWorkspace)
    expect(reopened.list(project.id)).toEqual([versionedWorkspace])
  })

  it("refuses a workspace whose parent project does not exist", () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    const store = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map()),
    })

    expect(() => store.upsert(workspace)).toThrow("Unknown project id")
  })

  it("fails closed for corrupt workspace records", () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    const store = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map([["workspace-1", { id: "workspace-1" }]])),
    })

    expect(() => store.get("workspace-1")).toThrow("registry is corrupt")
  })

  it("writes a canonical home back onto a legacy projectId-only workspace", () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    projects.upsert(project)
    const values = new Map<string, unknown>([
      [
        workspace.id,
        (() => {
          const legacy = { ...workspace }
          delete legacy.homeScopeId
          return legacy
        })(),
      ],
    ])
    const store = new WorkspaceRegistry({
      projects,
      store: memoryKv(values),
    })

    expect(store.get(workspace.id)).toEqual(versionedWorkspace)
    expect(values.get(workspace.id)).toEqual(versionedWorkspace)
  })

  it("increments revisions only when the expected revision matches", () => {
    const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
    projects.upsert(project)
    const store = new WorkspaceRegistry({
      projects,
      store: memoryKv(new Map()),
    })
    const created = store.upsert(workspace)

    expect(
      store.upsert(
        { ...created, description: "Updated workspace." },
        { expectedRevision: created.revision! },
      ),
    ).toMatchObject({ description: "Updated workspace.", revision: 2 })
    expect(() =>
      store.upsert(
        { ...created, description: "Stale workspace." },
        { expectedRevision: created.revision! },
      ),
    ).toThrow("revision conflict")
  })

  it("allows exactly one independently constructed Mirk client to win a revision race", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-workspace-race-"))
    temporaryDirectories.push(directory)
    const projects = new ProjectRegistry({
      cwd: directory,
      projectRoot: directory,
    })
    projects.upsert(project)
    const seed = new WorkspaceRegistry({
      cwd: directory,
      projectRoot: directory,
      projects,
    })
    const created = seed.upsert(workspace)
    const contenders = [
      {
        description: "Update from contender A.",
        registry: new WorkspaceRegistry({
          cwd: directory,
          projectRoot: directory,
          projects: new ProjectRegistry({
            cwd: directory,
            projectRoot: directory,
          }),
        }),
      },
      {
        description: "Update from contender B.",
        registry: new WorkspaceRegistry({
          cwd: directory,
          projectRoot: directory,
          projects: new ProjectRegistry({
            cwd: directory,
            projectRoot: directory,
          }),
        }),
      },
    ]

    const results = await Promise.allSettled(
      contenders.map(({ description, registry }) =>
        Promise.resolve().then(() =>
          registry.upsert(
            { ...created, description },
            { expectedRevision: created.revision! },
          ),
        ),
      ),
    )
    const winners = results.filter(
      (result): result is PromiseFulfilledResult<Workspace> =>
        result.status === "fulfilled",
    )

    expect(winners).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1)
    expect(winners[0].value.revision).toBe(2)
    expect(
      new WorkspaceRegistry({
        cwd: directory,
        projectRoot: directory,
        projects,
      }).get(workspace.id),
    ).toEqual(winners[0].value)
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
