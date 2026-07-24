import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { KvStore } from "@gonk/store/types"
import { afterEach, describe, expect, it } from "vitest"

import {
  type Project,
  ProjectRegistry,
  withRegistryRecordLock,
} from "./project-registry"

const temporaryDirectories: string[] = []

const project: Project = {
  id: "project-1",
  name: "Project One",
  description: "A durable project record.",
  members: [
    { principalId: "user-owner", role: "owner" },
    { principalId: "user-member", role: "member" },
  ],
  settings: { visibility: "shared" },
  createdAt: "2026-07-20T12:00:00.000Z",
  createdBy: "user-owner",
}

// Container slugs: normalize() backfills a kebab-of-name slug on first read.
const versionedProject = { ...project, revision: 1, slug: "project-one" }

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

describe("ProjectRegistry", () => {
  it("persists authoritative project records through Mirk", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-projects-"))
    temporaryDirectories.push(directory)
    const first = new ProjectRegistry({
      cwd: directory,
      projectRoot: directory,
    })

    expect(first.list()).toEqual([])
    expect(first.upsert(project)).toEqual(versionedProject)

    const reopened = new ProjectRegistry({
      cwd: directory,
      projectRoot: directory,
    })
    expect(reopened.get("project-1")).toEqual(versionedProject)
    expect(reopened.hasMember("project-1", "user-member")).toBe(true)
    expect(reopened.hasMember("project-1", "user-outsider")).toBe(false)
  })

  // Authz finding 2 (2026-07-23, Annika): upsert() reads its own
  // just-written record back (`persisted = this.get(project.id)`) to return
  // it, from INSIDE its own withRegistryRecordLock — and that record still
  // needs a slug backfilled on a fresh create, so this hits the locked
  // backfill path for the SAME id, on a REAL file lock (this test uses
  // cwd/projectRoot, not an injected store — `store:` disables locking
  // entirely). Without the reentrancy guard, this self-deadlocks: the
  // nested acquire spins on the lock file the outer call already holds
  // until LOCK_TIMEOUT_MS, then throws. A second real upsert on the SAME
  // id makes the read-back path unavoidable, so this fails loudly (timeout
  // + throw) if the guard regresses, rather than silently.
  it("does not self-deadlock when upsert's own read-back needs a locked backfill", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-projects-lock-"))
    temporaryDirectories.push(directory)
    const store = new ProjectRegistry({ cwd: directory, projectRoot: directory })

    const first = store.upsert(project)
    expect(first.slug).toBe("project-one")

    const second = store.upsert(
      { ...first, description: "Updated description." },
      { expectedRevision: first.revision! },
    )
    expect(second.slug).toBe("project-one")
    expect(second.description).toBe("Updated description.")
  })

  // Hardening (2026-07-23, Annika's re-review): the lock is released the
  // instant `operation()` RETURNS, not when a returned Promise settles — an
  // async operation would run its real work unprotected after the lock is
  // already gone. Both call sites (no lockDirectory, and the reentrant
  // fast path) share the same runtime check, so this covers both.
  it("rejects an async operation instead of silently releasing the lock early", () => {
    expect(() =>
      withRegistryRecordLock(undefined, "some-id", () => Promise.resolve(1)),
    ).toThrow(/returned a Promise/)
  })

  it("fails closed for corrupt project records", () => {
    const store = new ProjectRegistry({
      store: memoryKv(new Map([["project-1", { id: "project-1" }]])),
    })

    expect(() => store.get("project-1")).toThrow("registry is corrupt")
  })

  it("rejects duplicate member principals before persisting", () => {
    const store = new ProjectRegistry({ store: memoryKv(new Map()) })

    expect(() =>
      store.upsert({
        ...project,
        members: [
          { principalId: "user-owner", role: "owner" },
          { principalId: "user-owner", role: "member" },
        ],
      }),
    ).toThrow("record is invalid")
  })

  it("defaults legacy records to revision 1 and writes the safe migration back", () => {
    const values = new Map<string, unknown>([["project-1", project]])
    const store = new ProjectRegistry({ store: memoryKv(values) })

    expect(store.get("project-1")).toEqual(versionedProject)
    expect(values.get("project-1")).toEqual(versionedProject)
  })

  it("increments revisions only when the expected revision matches", () => {
    const store = new ProjectRegistry({ store: memoryKv(new Map()) })
    const created = store.upsert(project)

    expect(
      store.upsert(
        { ...created, description: "Updated project." },
        { expectedRevision: created.revision! },
      ),
    ).toMatchObject({ description: "Updated project.", revision: 2 })
    expect(() =>
      store.upsert(
        { ...created, description: "Stale project." },
        { expectedRevision: created.revision! },
      ),
    ).toThrow("revision conflict")
  })

  it("allows exactly one independently constructed Mirk client to win a revision race", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-project-race-"))
    temporaryDirectories.push(directory)
    const seed = new ProjectRegistry({
      cwd: directory,
      projectRoot: directory,
    })
    seed.upsert(project)
    const moduleUrl = new URL("./project-registry.ts", import.meta.url).href
    const contenderSource = `
      import { ProjectRegistry } from ${JSON.stringify(moduleUrl)}
      const [directory, description] = process.argv.slice(1)
      const registry = new ProjectRegistry({ cwd: directory, projectRoot: directory })
      const current = registry.get("project-1")
      process.stdout.write("ready\\n")
      process.stdin.once("data", () => {
        try {
          const value = registry.upsert(
            { ...current, description },
            { expectedRevision: current.revision },
          )
          process.stdout.write(JSON.stringify({ status: "fulfilled", value }) + "\\n")
        } catch (error) {
          process.stdout.write(JSON.stringify({ status: "rejected", message: error.message }) + "\\n")
        }
      })
    `
    const children = [
      "Update from contender A.",
      "Update from contender B.",
    ].map((description) =>
      spawn(
        process.execPath,
        [
          "--experimental-transform-types",
          "--input-type=module",
          "--eval",
          contenderSource,
          directory,
          description,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      ),
    )
    const output = children.map(() => "")
    const ready = children.map(
      (child, index) =>
        new Promise<void>((resolveReady, rejectReady) => {
          child.once("error", rejectReady)
          child.stdout.on("data", (chunk: Buffer) => {
            output[index] += chunk.toString()
            if (output[index].includes("ready\n")) resolveReady()
          })
        }),
    )
    const completed = children.map(
      (child, index) =>
        new Promise<{ status: string; value?: Project }>(
          (resolveChild, rejectChild) => {
            child.once("error", rejectChild)
            child.once("close", (code) => {
              if (code !== 0) {
                rejectChild(new Error(`Contender exited ${code}.`))
                return
              }
              const resultLine = output[index]
                .trim()
                .split("\n")
                .find((line) => line.startsWith("{"))
              if (!resultLine) {
                rejectChild(new Error("Contender returned no result."))
                return
              }
              resolveChild(JSON.parse(resultLine))
            })
          },
        ),
    )

    await Promise.all(ready)
    children.forEach((child) => child.stdin.end("go\n"))
    const results = await Promise.all(completed)
    const winners = results.filter(
      (result): result is { status: "fulfilled"; value: Project } =>
        result.status === "fulfilled" && result.value !== undefined,
    )

    expect(winners).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1)
    expect(winners[0].value.revision).toBe(2)
    expect(
      new ProjectRegistry({ cwd: directory, projectRoot: directory }).get(
        project.id,
      ),
    ).toEqual(winners[0].value)
  })

  describe("container slugs", () => {
    it("mints a kebab-of-name slug on create", () => {
      const store = new ProjectRegistry({ store: memoryKv(new Map()) })
      const created = store.upsert(project)

      expect(created.slug).toBe("project-one")
    })

    it("lazily backfills a slug for a pre-migration record on read, and persists it", () => {
      const values = new Map<string, unknown>([
        ["project-1", { ...project, revision: 1 }],
      ])
      const store = new ProjectRegistry({ store: memoryKv(values) })
      expect(values.get("project-1")).not.toHaveProperty("slug")

      const read = store.get("project-1")

      expect(read?.slug).toBe("project-one")
      expect(values.get("project-1")).toMatchObject({ slug: "project-one" })
      // Second read is a cache hit on the persisted slug, not a re-mint.
      expect(store.get("project-1")?.slug).toBe("project-one")
    })

    it("suffixes a colliding kebab slug and never regenerates it on update", () => {
      const store = new ProjectRegistry({ store: memoryKv(new Map()) })
      const first = store.upsert(project)
      const second = store.upsert({
        ...project,
        id: "project-2",
        name: "Project One", // Same name — kebab collides with `first`.
      })

      expect(first.slug).toBe("project-one")
      expect(second.slug).toMatch(/^project-one-[0-9a-z]{4}$/)
      expect(second.slug).not.toBe(first.slug)

      // Immutable across a rename, even if the caller's payload tries to
      // change or drop it — the registry preserves the current slug.
      const renamed = store.upsert(
        { ...second, name: "Totally Different Name", slug: undefined },
        { expectedRevision: second.revision },
      )
      expect(renamed.slug).toBe(second.slug)
    })

    // Authz finding (2026-07-23, Annika): id and slug share one namespace,
    // and a caller-supplied id is otherwise unconstrained. Without this
    // guard, an attacker could create a project whose id equals an existing
    // project's slug and shadow it at the route-resolution boundary.
    it("rejects creating a project whose id collides with an existing project's slug", () => {
      const store = new ProjectRegistry({ store: memoryKv(new Map()) })
      const victim = store.upsert(project)
      expect(victim.slug).toBe("project-one")

      expect(() =>
        store.upsert({
          id: "project-one", // the victim's slug, used as a NEW project's id
          name: "Spoofing Project",
          description: "",
          members: [{ principalId: "attacker", role: "owner" }],
          settings: {},
          createdAt: "2026-07-21T00:00:00.000Z",
          createdBy: "attacker",
        }),
      ).toThrow(/collides with an existing project's slug/)

      // The victim is unaffected by the rejected attempt.
      expect(store.get(victim.id)?.slug).toBe("project-one")
      expect(store.get("project-one")).toBeUndefined()
    })

    // The reverse direction: a freshly minted slug must not shadow an
    // EXISTING project's id either (mintUniqueSlug's half of the guard).
    it("never mints a slug that collides with an existing project's id", () => {
      const store = new ProjectRegistry({ store: memoryKv(new Map()) })
      // This project's id happens to equal the kebab-case of the name the
      // next project will mint a slug from.
      store.upsert({
        ...project,
        id: "second-project",
        name: "Placeholder",
      })
      const second = store.upsert({
        ...project,
        id: "project-2",
        name: "Second Project", // kebab-cases to "second-project"
      })
      expect(second.slug).not.toBe("second-project")
      expect(second.slug).toMatch(/^second-project-[0-9a-z]{4}$/)
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
