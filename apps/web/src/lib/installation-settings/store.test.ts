import { mkdirSync, mkdtempSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { FsScopeStore } from "@gonk/scope/fs"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { ENABLED_MODELS_KEY, FEATURE_FLAG_OVERRIDES_KEY } from "./registry"
import {
  InstallationSettingRejectedError,
  InstallationSettingsStore,
} from "./store"

/** A real project-tier KV over a throwaway directory — not a hand-rolled fake. */
function realKv(): KvStore<unknown> {
  const root = mkdtempSync(join(tmpdir(), "sigil-installation-settings-"))
  // A bare tmpdir carries no project marker, and an unresolved project tier
  // silently falls back to the REAL home directory — durable state shared
  // across every test run on the machine. The marker keeps the tier inside
  // this throwaway root; the assertion keeps the fallback from ever coming
  // back quietly.
  mkdirSync(join(root, ".agents"))
  const scope = new FsScopeStore({
    cwd: root,
    homeRoot: root,
    sessionId: "test-session",
    sessionHome: join(root, "test-session"),
  })
  const projectHome = scope.home("project")
  if (!projectHome || !realpathSync(projectHome).startsWith(realpathSync(root))) {
    throw new Error("test scope escaped its tmpdir — project tier unresolved")
  }
  return createStoreProvider(scope, {
    backendFactory: mirkBackendFactory(scope),
  }).kv("project", "sigil-chat.installation-settings.v1")
}

describe("InstallationSettingsStore", () => {
  it("resolves the registered default before anything is written", () => {
    const store = new InstallationSettingsStore({ kv: realKv() })
    expect(store.get(ENABLED_MODELS_KEY)).toEqual([])
  })

  it("round-trips an enabled set through persistence", () => {
    const kv = realKv()
    new InstallationSettingsStore({ kv }).set(ENABLED_MODELS_KEY, [
      "codex/luna",
      "deepseek/chat",
    ])

    // A second instance over the same KV: the value came back from the store,
    // not from an in-memory field.
    expect(new InstallationSettingsStore({ kv }).get(ENABLED_MODELS_KEY)).toEqual(
      ["codex/luna", "deepseek/chat"],
    )
  })

  it("refuses a value the registry does not accept", () => {
    const store = new InstallationSettingsStore({ kv: realKv() })
    for (const invalid of [
      ["Codex/Luna"],
      ["../../etc"],
      ["codex/luna", "codex/luna"],
      ["ok", 7],
      "codex/luna",
    ]) {
      expect(
        () =>
          store.set(
            ENABLED_MODELS_KEY,
            invalid as unknown as string[],
          ),
        JSON.stringify(invalid),
      ).toThrow(InstallationSettingRejectedError)
    }
  })

  // The enforcement point runs inside session creation and cannot throw its
  // way out. An unreadable record must therefore read as "nothing enabled",
  // which refuses non-default models rather than failing every new chat.
  it("reads an invalid stored record as the default", () => {
    const kv = realKv()
    kv.set(ENABLED_MODELS_KEY, { not: "a list" })
    expect(new InstallationSettingsStore({ kv }).get(ENABLED_MODELS_KEY)).toEqual(
      [],
    )
  })

  // FLAG.1 acceptance criterion 4: model enablement and flags demonstrably
  // share the installation tier's storage and authorization path. Same KV,
  // same store class, two independent keys — not a second store standing in
  // beside this one.
  it("round-trips both consumers through the SAME store instance", () => {
    const kv = realKv()
    const store = new InstallationSettingsStore({ kv })
    expect(store.get(ENABLED_MODELS_KEY)).toEqual([])
    expect(store.get(FEATURE_FLAG_OVERRIDES_KEY)).toEqual({})

    store.set(ENABLED_MODELS_KEY, ["codex/luna"])
    store.set(FEATURE_FLAG_OVERRIDES_KEY, { "surfaces.reducerStudio": false })

    const reread = new InstallationSettingsStore({ kv })
    expect(reread.get(ENABLED_MODELS_KEY)).toEqual(["codex/luna"])
    expect(reread.get(FEATURE_FLAG_OVERRIDES_KEY)).toEqual({
      "surfaces.reducerStudio": false,
    })
  })

  it("refuses a flag override map the registry does not accept", () => {
    const store = new InstallationSettingsStore({ kv: realKv() })
    for (const invalid of [
      { valid: "not a boolean" },
      ["not", "a", "map"],
      "flags.overrides",
      { [`${"x".repeat(200)}`]: true },
    ]) {
      expect(() =>
        store.set(
          FEATURE_FLAG_OVERRIDES_KEY,
          invalid as unknown as Record<string, boolean>,
        ),
      ).toThrow(InstallationSettingRejectedError)
    }
  })

  // Same reasoning as the model allow-list: an enforcement seam evaluating a
  // flag cannot throw its way out, so an unreadable override record reads as
  // "no overrides" rather than failing the check.
  it("reads an invalid stored flag override record as the default", () => {
    const kv = realKv()
    kv.set(FEATURE_FLAG_OVERRIDES_KEY, "not an object")
    expect(
      new InstallationSettingsStore({ kv }).get(FEATURE_FLAG_OVERRIDES_KEY),
    ).toEqual({})
  })
})
