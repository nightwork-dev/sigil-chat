import { describe, expect, it } from "vitest"

import { PersonalScopeRegistry, personalScopeId } from "./personal-scope"
import { ProjectWorkspaceScopeRegistry } from "./scope-registry"

class MemoryKv<T> {
  private readonly values = new Map<string, T>()

  delete(key: string): void {
    this.values.delete(key)
  }

  get(key: string): T | undefined {
    const value = this.values.get(key)
    return value === undefined ? undefined : structuredClone(value)
  }

  set(key: string, value: T): void {
    this.values.set(key, structuredClone(value))
  }

  patch(key: string, patch: Partial<T>): T {
    const value = this.get(key)
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Cannot patch missing or non-object value ${key}.`)
    }
    const patched = { ...value, ...patch } as T
    this.set(key, patched)
    return patched
  }

  entries(prefix = ""): Array<{ key: string; value: T }> {
    return [...this.values.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({
        key,
        value: structuredClone(value),
      }))
  }

  list(prefix = ""): string[] {
    return [...this.values.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort((left, right) => left.localeCompare(right))
  }
}

describe("PersonalScopeRegistry", () => {
  it("materializes a deterministic principal-owned personal scope on demand", () => {
    const registry = new PersonalScopeRegistry({
      store: new MemoryKv<unknown>(),
    })

    expect(registry.getForPrincipal("user-1")).toBeUndefined()

    const scope = registry.ensureForPrincipal("user-1", {
      now: () => new Date("2026-07-21T20:00:00.000Z"),
    })

    expect(scope).toMatchObject({
      id: "personal-scope:user-1",
      principalId: "user-1",
      homeScopeId: "installation:default",
      createdBy: "user-1",
      revision: 1,
    })
    expect(personalScopeId("user-1")).toBe(scope.id)
    expect(registry.ensureForPrincipal("user-1")).toEqual(scope)
  })

  it("projects personal scopes through the canonical scope registry without project membership", () => {
    const personalScopes = new PersonalScopeRegistry({
      store: new MemoryKv<unknown>(),
    })
    const personal = personalScopes.ensureForPrincipal("user-1")
    const scopes = new ProjectWorkspaceScopeRegistry(
      { get: () => undefined },
      { get: () => undefined },
      personalScopes,
    )

    expect(scopes.get(personal.id)).toEqual({
      id: personal.id,
      kind: "personal",
      name: "Personal scope",
      description: "Private home for a principal's personal agent continuity.",
      homeScopeId: "installation:default",
      status: "active",
    })
  })
})
