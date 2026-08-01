import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { FsScopeStore } from "@gonk/scope/fs"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import { DISCOVERED_MODELS_KEY, ENABLED_MODELS_KEY } from "./registry"
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

describe("InstallationSettingsStore — models.discovered (MDL.2)", () => {
  const entry = {
    id: "deepseek/reasoner",
    providerId: "deepseek",
    model: "deepseek-reasoner",
    label: "deepseek-reasoner",
  }

  it("resolves to an empty cache before anything is written", () => {
    const store = new InstallationSettingsStore({ kv: realKv() })
    expect(store.get(DISCOVERED_MODELS_KEY)).toEqual([])
  })

  it("round-trips a discovered entry through persistence", () => {
    const kv = realKv()
    new InstallationSettingsStore({ kv }).set(DISCOVERED_MODELS_KEY, [entry])
    expect(
      new InstallationSettingsStore({ kv }).get(DISCOVERED_MODELS_KEY),
    ).toEqual([entry])
  })

  it("refuses an id that is not shaped provider/model", () => {
    const store = new InstallationSettingsStore({ kv: realKv() })
    for (const invalid of [
      // Single-segment — that grammar is reserved for deployment-default.
      { ...entry, id: "deepseek" },
      // Uppercase / punctuation a live catalog can report but the grammar refuses.
      { ...entry, id: "deepseek/Reasoner" },
      { ...entry, id: "deepseek/reasoner.v2" },
    ]) {
      expect(
        () => store.set(DISCOVERED_MODELS_KEY, [invalid as never]),
        JSON.stringify(invalid),
      ).toThrow(InstallationSettingRejectedError)
    }
  })

  it("refuses an id whose provider prefix does not match providerId", () => {
    const store = new InstallationSettingsStore({ kv: realKv() })
    expect(() =>
      store.set(DISCOVERED_MODELS_KEY, [
        { ...entry, id: "other-provider/reasoner" },
      ]),
    ).toThrow(InstallationSettingRejectedError)
  })

  it("refuses a rogue field — a discovered entry never carries a baseUrl or credential", () => {
    const store = new InstallationSettingsStore({ kv: realKv() })
    expect(() =>
      store.set(DISCOVERED_MODELS_KEY, [
        { ...entry, baseUrl: "http://127.0.0.1:1234/v1" } as never,
      ]),
    ).toThrow(InstallationSettingRejectedError)
    expect(() =>
      store.set(DISCOVERED_MODELS_KEY, [
        { ...entry, apiKeyEnv: "SIGIL_MODEL_X" } as never,
      ]),
    ).toThrow(InstallationSettingRejectedError)
  })

  it("refuses duplicate ids in one write", () => {
    const store = new InstallationSettingsStore({ kv: realKv() })
    expect(() =>
      store.set(DISCOVERED_MODELS_KEY, [entry, entry]),
    ).toThrow(InstallationSettingRejectedError)
  })

  it("reads an invalid stored record as an empty cache", () => {
    const kv = realKv()
    kv.set(DISCOVERED_MODELS_KEY, "not a list")
    expect(
      new InstallationSettingsStore({ kv }).get(DISCOVERED_MODELS_KEY),
    ).toEqual([])
  })
})
