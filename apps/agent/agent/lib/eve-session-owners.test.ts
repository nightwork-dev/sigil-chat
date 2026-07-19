import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { KvStore } from "@gonk/store/types"
import { afterEach, describe, expect, it } from "vitest"

import {
  MemoryEveSessionOwnerStore,
  MirkEveSessionOwnerStore,
} from "./eve-session-owners"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  )
})

describe("EveSessionOwnerStore", () => {
  it("persists an immutable session-to-subject binding through Mirk", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-eve-owners-"))
    temporaryDirectories.push(directory)
    const first = new MirkEveSessionOwnerStore({
      cwd: directory,
      projectRoot: directory,
    })

    await first.bind("session-1", "user-1")
    await first.bind("session-1", "user-1")

    const reopened = new MirkEveSessionOwnerStore({
      cwd: directory,
      projectRoot: directory,
    })
    await expect(reopened.getOwner("session-1")).resolves.toBe("user-1")
    await expect(reopened.bind("session-1", "user-2")).rejects.toThrow(
      "already bound to another principal",
    )
  })

  it("fails closed when a Mirk owner record is corrupt", async () => {
    const values = new Map<string, unknown>([["session-1", { version: 1 }]])
    const store = new MirkEveSessionOwnerStore({
      store: memoryKv(values),
    })

    await expect(store.getOwner("session-1")).rejects.toThrow(
      "store is corrupt",
    )
  })

  it("rejects rebinding in memory as well as on disk", async () => {
    const store = new MemoryEveSessionOwnerStore()
    await store.bind("session-1", "user-1")
    await expect(store.bind("session-1", "user-2")).rejects.toThrow(
      "already bound to another principal",
    )
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
