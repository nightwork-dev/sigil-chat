import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { MirkAgentThreadScopeOwnerRegistry } from "./agent-thread-scope-owners"

describe("agent thread scope owner projection", () => {
  it("lists only the principal's live session identities in activity order", () => {
    const registry = new MirkAgentThreadScopeOwnerRegistry({
      store: memoryKv(
        new Map([
          [
            "thread:older",
            {
              id: "older",
              executionBinding: { homeScopeId: "workspace-home" },
              title: "Older session",
              updatedAt: "2026-07-20T00:00:00.000Z",
              members: ["user-a"],
            },
          ],
          [
            "thread:newer",
            {
              id: "newer",
              executionBinding: { homeScopeId: "personal-scope:user-a" },
              title: "Newer session",
              updatedAt: "2026-07-21T00:00:00.000Z",
              members: ["user-a", "user-b"],
            },
          ],
          [
            "thread:hidden",
            {
              id: "hidden",
              executionBinding: { homeScopeId: "workspace-hidden" },
              title: "Another principal",
              updatedAt: "2026-07-22T00:00:00.000Z",
              members: ["user-b"],
            },
          ],
        ]),
      ),
    })

    expect(registry.listOwned("user-a")).toEqual([
      {
        id: "newer",
        homeScopeId: "personal-scope:user-a",
        title: "Newer session",
        updatedAt: "2026-07-21T00:00:00.000Z",
      },
      {
        id: "older",
        homeScopeId: "workspace-home",
        title: "Older session",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
    ])
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
