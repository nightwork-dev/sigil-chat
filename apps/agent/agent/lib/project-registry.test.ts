import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { KvStore } from "@gonk/store/types"
import { afterEach, describe, expect, it } from "vitest"

import { type Project, ProjectRegistry } from "./project-registry"

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

const versionedProject = { ...project, revision: 1 }

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
    const created = seed.upsert(project)
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
