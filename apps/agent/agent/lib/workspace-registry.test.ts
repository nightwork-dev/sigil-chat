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

// Container slugs: normalize() backfills a kebab-of-name slug on first read.
const versionedWorkspace = { ...workspace, revision: 1, slug: "workspace-one" }

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

  // Authz finding 2 (2026-07-23, Annika) — same reentrancy hazard as
  // ProjectRegistry's (project-registry.test.ts): upsert()'s own read-back
  // hits a locked backfill for the SAME id, on a real file lock.
  it("does not self-deadlock when upsert's own read-back needs a locked backfill", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-workspaces-lock-"))
    temporaryDirectories.push(directory)
    const projects = new ProjectRegistry({ cwd: directory, projectRoot: directory })
    projects.upsert(project)
    const store = new WorkspaceRegistry({
      cwd: directory,
      projectRoot: directory,
      projects,
    })

    const first = store.upsert(workspace)
    expect(first.slug).toBe("workspace-one")

    const second = store.upsert(
      { ...first, description: "Updated description." },
      { expectedRevision: first.revision! },
    )
    expect(second.slug).toBe("workspace-one")
    expect(second.description).toBe("Updated description.")
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

  describe("container slugs", () => {
    function freshStore() {
      const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
      projects.upsert(project)
      return new WorkspaceRegistry({ projects, store: memoryKv(new Map()) })
    }

    it("mints a kebab-of-name slug on create", () => {
      const store = freshStore()
      const created = store.upsert(workspace)

      expect(created.slug).toBe("workspace-one")
    })

    it("lazily backfills a slug for a pre-migration record on read, and persists it", () => {
      const projects = new ProjectRegistry({ store: memoryKv(new Map()) })
      projects.upsert(project)
      const values = new Map<string, unknown>([[workspace.id, workspace]])
      const store = new WorkspaceRegistry({ projects, store: memoryKv(values) })
      expect(values.get(workspace.id)).not.toHaveProperty("slug")

      const read = store.get(workspace.id)

      expect(read?.slug).toBe("workspace-one")
      expect(values.get(workspace.id)).toMatchObject({ slug: "workspace-one" })
    })

    it("suffixes a colliding kebab slug and never regenerates it on update", () => {
      const store = freshStore()
      const first = store.upsert(workspace)
      const second = store.upsert({
        ...workspace,
        id: "workspace-2",
        name: "Workspace One", // Same name — kebab collides with `first`.
      })

      expect(first.slug).toBe("workspace-one")
      expect(second.slug).toMatch(/^workspace-one-[0-9a-z]{4}$/)

      // Immutable across a rename, even if the caller's payload tries to
      // change or drop it — the registry preserves the current slug.
      const renamed = store.upsert(
        { ...second, name: "Totally Different Name", slug: undefined },
        { expectedRevision: second.revision },
      )
      expect(renamed.slug).toBe(second.slug)
    })

    // Authz finding (2026-07-23, Annika) — same guard as ProjectRegistry's
    // (project-registry.test.ts), applied here for workspaces.
    it("rejects creating a workspace whose id collides with an existing workspace's slug", () => {
      const store = freshStore()
      const victim = store.upsert(workspace)
      expect(victim.slug).toBe("workspace-one")

      expect(() =>
        store.upsert({
          id: "workspace-one", // the victim's slug, used as a NEW workspace's id
          projectId: project.id,
          homeScopeId: project.id,
          name: "Spoofing Workspace",
          description: "",
          status: "active",
          createdAt: "2026-07-21T00:00:00.000Z",
          createdBy: "attacker",
        }),
      ).toThrow(/collides with an existing workspace's slug/)

      expect(store.get(victim.id)?.slug).toBe("workspace-one")
      expect(store.get("workspace-one")).toBeUndefined()
    })

    it("never mints a slug that collides with an existing workspace's id", () => {
      const store = freshStore()
      store.upsert({
        ...workspace,
        id: "second-workspace",
        name: "Placeholder",
      })
      const second = store.upsert({
        ...workspace,
        id: "workspace-2",
        name: "Second Workspace", // kebab-cases to "second-workspace"
      })
      expect(second.slug).not.toBe("second-workspace")
      expect(second.slug).toMatch(/^second-workspace-[0-9a-z]{4}$/)
    })
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
