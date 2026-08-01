import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { FsScopeStore } from "@gonk/scope/fs"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { ENABLED_MODELS_KEY } from "./registry"
import {
  InstallationSettingRejectedError,
  InstallationSettingsStore,
} from "./store"

/** A real project-tier KV over a throwaway directory — not a hand-rolled fake. */
function realKv(): KvStore<unknown> {
  const root = mkdtempSync(join(tmpdir(), "sigil-installation-settings-"))
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
})
