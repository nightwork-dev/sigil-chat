import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { FsScopeStore } from "@gonk/scope/fs"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { readDiscoveredModelCache } from "./discovered-model-cache"

/**
 * A real project-tier KV over the SAME namespace/key apps/web's
 * InstallationSettingsStore writes to — this is the cross-process contract
 * this file exists to prove, not a hand-rolled fake of it.
 */
function realKv(): KvStore<unknown> {
  const root = mkdtempSync(join(tmpdir(), "sigil-discovered-model-cache-"))
  const scope = new FsScopeStore({
    cwd: root,
    homeRoot: root,
    sessionId: "test-session",
    sessionHome: join(root, "test-session"),
  })
  return createStoreProvider(scope, {
    backendFactory: mirkBackendFactory(scope),
  }).kv("project", "sigil-chat.installation-settings.v1")
}

describe("readDiscoveredModelCache", () => {
  it("resolves to nothing before anything is written", () => {
    expect(readDiscoveredModelCache({ kv: realKv() })).toEqual([])
  })

  it("reads back exactly what apps/web's store shape would write", () => {
    const kv = realKv()
    kv.set("models.discovered", [
      {
        id: "deepseek/reasoner",
        providerId: "deepseek",
        model: "deepseek-reasoner",
        label: "deepseek-reasoner",
        contextWindowTokens: 65_536,
      },
    ])

    expect(readDiscoveredModelCache({ kv })).toEqual([
      {
        id: "deepseek/reasoner",
        providerId: "deepseek",
        model: "deepseek-reasoner",
        label: "deepseek-reasoner",
        contextWindowTokens: 65_536,
      },
    ])
  })

  // The session-resolution path this feeds cannot throw its way out of a
  // corrupt record — the safe answer is "nothing discovered", the same
  // fallback the fixture-authored path already has for a missing preset.
  it("reads a corrupt record as empty rather than throwing", () => {
    const kv = realKv()
    kv.set("models.discovered", { not: "a list" })
    expect(readDiscoveredModelCache({ kv })).toEqual([])

    const kv2 = realKv()
    kv2.set("models.discovered", [{ id: "no-provider-id" }, "nope", 7])
    expect(readDiscoveredModelCache({ kv: kv2 })).toEqual([])
  })

  it("drops an individual malformed entry without discarding its valid siblings", () => {
    const kv = realKv()
    kv.set("models.discovered", [
      { id: "deepseek/reasoner", providerId: "deepseek", model: "x", label: "x" },
      { id: "bad" },
    ])
    expect(readDiscoveredModelCache({ kv })).toEqual([
      { id: "deepseek/reasoner", providerId: "deepseek", model: "x", label: "x" },
    ])
  })
})
