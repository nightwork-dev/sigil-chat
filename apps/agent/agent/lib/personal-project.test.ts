import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import {
  ensurePersonalProject,
  isPersonalProjectId,
  personalProjectId,
} from "./personal-project"
import { ProjectRegistry } from "./project-registry"

describe("personalProjectId", () => {
  it("is deterministic per principal and recognizable", () => {
    const id = personalProjectId("user-1")
    expect(id).toBe(personalProjectId("user-1"))
    expect(id).not.toBe(personalProjectId("user-2"))
    expect(isPersonalProjectId(id)).toBe(true)
    expect(isPersonalProjectId("project-1")).toBe(false)
  })

  it("rejects a blank principal id", () => {
    expect(() => personalProjectId("  ")).toThrow("non-empty")
  })
})

describe("ensurePersonalProject", () => {
  it("seeds a personal project on first use and is idempotent", () => {
    const registry = new ProjectRegistry({ store: memoryKv(new Map()) })

    const seeded = ensurePersonalProject(registry, "user-1", {
      now: () => new Date("2026-07-20T12:00:00.000Z"),
    })

    expect(seeded).toMatchObject({
      id: personalProjectId("user-1"),
      name: "Personal",
      members: [{ principalId: "user-1", role: "owner" }],
    })

    const again = ensurePersonalProject(registry, "user-1", {
      now: () => new Date("2026-07-20T13:00:00.000Z"),
    })
    expect(again).toEqual(seeded)
    expect(registry.list()).toHaveLength(1)
  })

  it("gives each principal an independent personal project", () => {
    const registry = new ProjectRegistry({ store: memoryKv(new Map()) })

    const first = ensurePersonalProject(registry, "user-1")
    const second = ensurePersonalProject(registry, "user-2")

    expect(first.id).not.toBe(second.id)
    expect(registry.hasMember(first.id, "user-2")).toBe(false)
    expect(registry.hasMember(second.id, "user-1")).toBe(false)
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
