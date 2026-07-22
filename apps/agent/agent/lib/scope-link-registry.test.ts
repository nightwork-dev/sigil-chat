import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { ScopeLinkRegistry } from "./scope-link-registry"
import type { ScopeRecord } from "./scope-registry"

const scopes = new Map<string, ScopeRecord>(
  ["project-a", "project-b", "workspace-a", "workspace-b"].map((id) => [
    id,
    {
      id,
      kind: id.startsWith("project") ? "project" : "workspace",
      name: id,
      status: "active",
    },
  ]),
)

describe("ScopeLinkRegistry", () => {
  it("writes revisioned, audited links and reorders them", () => {
    const registry = createRegistry()
    const created = registry.create({
      kind: "mounted-in",
      subjectScopeId: "workspace-a",
      targetScopeId: "project-a",
      order: 4,
      createdBy: "owner-1",
    })

    expect(created.revision).toBe(1)
    const reordered = registry.reorder(created.id, 1, "owner-2", 1)
    expect(reordered).toMatchObject({ order: 1, revision: 2 })
    expect(registry.listAudit(created.id)).toEqual([
      expect.objectContaining({
        action: "created",
        actorId: "owner-1",
        after: created,
      }),
      expect.objectContaining({
        action: "updated",
        actorId: "owner-2",
        before: created,
        after: reordered,
      }),
    ])

    expect(() => registry.reorder(created.id, 2, "owner-2", 1)).toThrow(
      "changed from revision 1 to 2",
    )
  })

  it("rejects unknown endpoints and relation-local cycles before persistence", () => {
    const registry = createRegistry()
    expect(() =>
      registry.create({
        kind: "mounted-in",
        subjectScopeId: "missing",
        targetScopeId: "project-a",
        order: 0,
        createdBy: "owner-1",
      }),
    ).toThrow("Unknown subject scope id")

    registry.create({
      kind: "mounted-in",
      subjectScopeId: "workspace-a",
      targetScopeId: "project-a",
      order: 0,
      createdBy: "owner-1",
    })
    registry.create({
      kind: "mounted-in",
      subjectScopeId: "project-b",
      targetScopeId: "workspace-a",
      order: 0,
      createdBy: "owner-1",
    })

    expect(() =>
      registry.create({
        kind: "mounted-in",
        subjectScopeId: "project-a",
        targetScopeId: "project-b",
        order: 0,
        createdBy: "owner-1",
      }),
    ).toThrow("would create a cycle")
    expect(
      registry.create({
        kind: "rolls-up-to",
        subjectScopeId: "project-a",
        targetScopeId: "project-b",
        order: 0,
        createdBy: "owner-1",
      }),
    ).toMatchObject({ kind: "rolls-up-to", revision: 1 })
  })

  it("removes the link while retaining its audited snapshot", () => {
    const registry = createRegistry()
    const created = registry.create({
      kind: "discoverable-from",
      subjectScopeId: "workspace-a",
      targetScopeId: "project-a",
      order: 0,
      createdBy: "owner-1",
    })

    expect(registry.remove(created.id, "owner-2", 1)).toEqual(created)
    expect(registry.get(created.id)).toBeUndefined()
    expect(registry.listAudit(created.id).at(-1)).toEqual(
      expect.objectContaining({ action: "removed", before: created }),
    )
  })

  it("traverses only the requested relation in deterministic order", () => {
    const registry = createRegistry()
    registry.create({
      kind: "mounted-in",
      subjectScopeId: "workspace-a",
      targetScopeId: "project-a",
      order: 2,
      createdBy: "owner-1",
    })
    registry.create({
      kind: "mounted-in",
      subjectScopeId: "workspace-b",
      targetScopeId: "project-a",
      order: 1,
      createdBy: "owner-1",
    })
    registry.create({
      kind: "rolls-up-to",
      subjectScopeId: "project-b",
      targetScopeId: "project-a",
      order: 0,
      createdBy: "owner-1",
    })

    expect(registry.traverseSubjects("project-a", "mounted-in")).toEqual([
      "project-a",
      "workspace-b",
      "workspace-a",
    ])
  })
})

function createRegistry(): ScopeLinkRegistry {
  let id = 0
  return new ScopeLinkRegistry({
    scopes: { get: (scopeId) => scopes.get(scopeId) },
    links: memoryKv(new Map()),
    audit: memoryKv(new Map()),
    now: () => new Date("2026-07-21T00:00:00.000Z"),
    createId: () => `id-${++id}`,
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
    list: (prefix = "") => [...values.keys()].filter((key) => key.startsWith(prefix)),
    patch: () => {
      throw new Error("not implemented")
    },
    set: (key, value) => void values.set(key, value),
  }
}
