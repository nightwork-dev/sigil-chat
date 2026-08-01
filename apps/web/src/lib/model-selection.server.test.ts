// The create-time gate, against the REAL application fixture.
//
// The point of running these against `fixtures/application/sigil-chat.yaml`
// rather than a synthetic config is that the allow-list's headline claim is
// about this deployment: codex/sol is authored and stays authored, and after
// this change it is unreachable until David enables it.

import { describe, expect, it } from "vitest"

import type { DiscoveredModelRecord } from "./installation-settings/registry"
import {
  allModelPresets,
  authoredModelPresets,
  discoveredModelPresets,
  isSelectableModelPreset,
  resolveSelectableModelPreset,
} from "./model-selection.server"

function preset(id: string) {
  const found = authoredModelPresets().find((candidate) => candidate.id === id)
  if (!found) throw new Error(`The fixture no longer authors "${id}".`)
  return found
}

describe("isSelectableModelPreset", () => {
  it("refuses an authored model on an installation that has enabled nothing", () => {
    expect(isSelectableModelPreset(preset("codex/sol"), [])).toBe(false)
  })

  it("admits it once the owner has enabled it", () => {
    expect(isSelectableModelPreset(preset("codex/sol"), ["codex/sol"])).toBe(
      true,
    )
  })

  it("does not let one enabled model admit its siblings", () => {
    expect(isSelectableModelPreset(preset("codex/luna"), ["codex/sol"])).toBe(
      false,
    )
  })

  it("keeps the deployment default selectable on a fresh installation", () => {
    expect(isSelectableModelPreset(preset("deployment-default"), [])).toBe(true)
  })
})

// MDL.2 catalog discovery: a model Eve's live catalog fetch reported that the
// fixture never authored. discoveredModelPresets/allModelPresets take the
// cache as a parameter precisely so these tests never touch the real
// project-tier store the production functions default to.
describe("discoveredModelPresets", () => {
  const DEEPSEEK_REASONER: DiscoveredModelRecord = {
    id: "deepseek/reasoner",
    providerId: "deepseek",
    model: "deepseek-reasoner",
    label: "deepseek-reasoner",
  }

  it("synthesizes a preset by borrowing its authored provider's transport facts", () => {
    const [synthesized] = discoveredModelPresets([DEEPSEEK_REASONER])
    expect(synthesized).toMatchObject({
      id: "deepseek/reasoner",
      provider: "openai-compatible",
      model: "deepseek-reasoner",
      baseUrl: "https://api.deepseek.com/v1",
      apiKeyEnv: "SIGIL_MODEL_DEEPSEEK_API_KEY",
      contextWindowTokens: 65_536,
      isDeploymentDefault: false,
      // No fixture author exists for a model the fixture never authored —
      // enabled:true here means "no veto", not "selectable"; the allow-list
      // check below is what actually gates it.
      enabled: true,
    })
  })

  it("drops a cached entry whose provider is no longer authored", () => {
    expect(
      discoveredModelPresets([{ ...DEEPSEEK_REASONER, providerId: "ghost" }]),
    ).toEqual([])
  })

  it("returns nothing for an empty cache", () => {
    expect(discoveredModelPresets([])).toEqual([])
  })
})

describe("allModelPresets", () => {
  const DEEPSEEK_REASONER: DiscoveredModelRecord = {
    id: "deepseek/reasoner",
    providerId: "deepseek",
    model: "deepseek-reasoner",
    label: "deepseek-reasoner",
  }

  it("appends discovered presets to the authored set", () => {
    const all = allModelPresets([DEEPSEEK_REASONER])
    expect(all.some((p) => p.id === "codex/luna")).toBe(true)
    expect(all.some((p) => p.id === "deepseek/reasoner")).toBe(true)
  })

  it("lets an authored id win over a same-id discovered entry", () => {
    const all = allModelPresets([
      { id: "codex/luna", providerId: "codex", model: "impostor", label: "x" },
    ])
    expect(all.filter((p) => p.id === "codex/luna")).toHaveLength(1)
    expect(all.find((p) => p.id === "codex/luna")?.model).toBe("gpt-5.6-luna")
  })
})

// The explicit MDL.2c contract: a newly discovered model is NOT selectable
// until an owner enables it — this is the same allow-list decision an
// authored model gets, exercised end to end through resolveSelectableModelPreset.
describe("a newly discovered model, end to end", () => {
  const DEEPSEEK_REASONER: DiscoveredModelRecord = {
    id: "deepseek/reasoner",
    providerId: "deepseek",
    model: "deepseek-reasoner",
    label: "deepseek-reasoner",
  }

  it("refuses to resolve a discovered model on an installation that enabled nothing", () => {
    expect(
      resolveSelectableModelPreset(
        "deepseek/reasoner",
        [],
        [DEEPSEEK_REASONER],
      ),
    ).toBeUndefined()
  })

  it("refuses even when a DIFFERENT model is enabled — one enable does not admit its siblings", () => {
    expect(
      resolveSelectableModelPreset(
        "deepseek/reasoner",
        ["codex/luna"],
        [DEEPSEEK_REASONER],
      ),
    ).toBeUndefined()
  })

  it("resolves once the owner has explicitly enabled it", () => {
    expect(
      resolveSelectableModelPreset(
        "deepseek/reasoner",
        ["deepseek/reasoner"],
        [DEEPSEEK_REASONER],
      ),
    ).toEqual({
      presetId: "deepseek/reasoner",
      provider: "openai-compatible",
      modelId: "deepseek-reasoner",
    })
  })

  it("refuses an id discovery never cached at all — no hand-crafted request can invent one", () => {
    expect(
      resolveSelectableModelPreset(
        "deepseek/nonexistent",
        ["deepseek/nonexistent"],
        [DEEPSEEK_REASONER],
      ),
    ).toBeUndefined()
  })
})
