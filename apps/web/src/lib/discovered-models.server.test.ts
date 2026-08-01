import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { FsScopeStore } from "@gonk/scope/fs"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import type { KvStore } from "@gonk/store/types"
import { describe, expect, it } from "vitest"

import {
  extractDiscoveredModels,
  persistDiscoveredModels,
} from "./discovered-models.server"
import { DISCOVERED_MODELS_KEY } from "./installation-settings/registry"
import { InstallationSettingsStore } from "./installation-settings/store"
import type { ModelProviderRecord } from "./model-endpoints"

function realKv(): KvStore<unknown> {
  const root = mkdtempSync(join(tmpdir(), "sigil-discovered-models-server-"))
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

const AUTHORED_MODEL: ModelProviderRecord["models"][number] = {
  id: "deepseek/chat",
  label: "deepseek-chat",
  model: "deepseek-chat",
  capability: "chat",
  enabled: true,
  contextWindowTokens: 65_536,
  isDeploymentDefault: false,
}

const DISCOVERED_MODEL: ModelProviderRecord["models"][number] = {
  id: "deepseek/reasoner",
  label: "deepseek-reasoner",
  model: "deepseek-reasoner",
  capability: "chat",
  enabled: true,
  contextWindowTokens: 65_536,
  isDeploymentDefault: false,
  discovered: true,
}

const PROVIDERS: ModelProviderRecord[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    enabled: true,
    credential: { required: true, present: true },
    models: [AUTHORED_MODEL, DISCOVERED_MODEL],
  },
  {
    id: "codex",
    label: "Codex subscription",
    kind: "codex",
    enabled: true,
    credential: { required: true, present: true },
    models: [
      {
        id: "deployment-default",
        label: "gpt-5.6-terra",
        model: "gpt-5.6-terra",
        capability: "chat",
        enabled: true,
        contextWindowTokens: 200_000,
        isDeploymentDefault: true,
      },
    ],
  },
]

describe("extractDiscoveredModels", () => {
  it("keeps only rows Eve flagged discovered, dropping the authored and deployment-default rows", () => {
    expect(extractDiscoveredModels(PROVIDERS)).toEqual([
      {
        id: "deepseek/reasoner",
        providerId: "deepseek",
        model: "deepseek-reasoner",
        label: "deepseek-reasoner",
        contextWindowTokens: 65_536,
      },
    ])
  })

  it("omits contextWindowTokens rather than writing zero when the provider reported none", () => {
    const [record] = extractDiscoveredModels([
      {
        ...PROVIDERS[0]!,
        models: [{ ...DISCOVERED_MODEL, contextWindowTokens: 0 }],
      },
    ])
    expect(record).toEqual({
      id: "deepseek/reasoner",
      providerId: "deepseek",
      model: "deepseek-reasoner",
      label: "deepseek-reasoner",
    })
    expect(record).not.toHaveProperty("contextWindowTokens")
  })

  it("returns nothing for a provider list with no discovered rows", () => {
    expect(
      extractDiscoveredModels([{ ...PROVIDERS[0]!, models: [AUTHORED_MODEL] }]),
    ).toEqual([])
  })
})

describe("persistDiscoveredModels", () => {
  it("writes the extracted set into the injected store", () => {
    const store = new InstallationSettingsStore({ kv: realKv() })
    persistDiscoveredModels(PROVIDERS, store)
    expect(store.get(DISCOVERED_MODELS_KEY)).toEqual([
      {
        id: "deepseek/reasoner",
        providerId: "deepseek",
        model: "deepseek-reasoner",
        label: "deepseek-reasoner",
        contextWindowTokens: 65_536,
      },
    ])
  })

  it("replaces the whole cache rather than merging — a model no longer reported drops off", () => {
    const store = new InstallationSettingsStore({ kv: realKv() })
    persistDiscoveredModels(PROVIDERS, store)
    persistDiscoveredModels(
      [{ ...PROVIDERS[0]!, models: [AUTHORED_MODEL] }, PROVIDERS[1]!],
      store,
    )
    expect(store.get(DISCOVERED_MODELS_KEY)).toEqual([])
  })

  // The safe failure: this runs as a side effect of a successful inventory
  // read, so a registry rejection here must not turn that read into a thrown
  // error for the owner looking at the settings page right now.
  it("swallows a registry rejection rather than throwing", () => {
    const rejecting = {
      set: () => {
        throw new Error("rejected")
      },
    }
    expect(() => persistDiscoveredModels(PROVIDERS, rejecting)).not.toThrow()
  })
})
