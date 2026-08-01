// The create-time gate, against the REAL application fixture.
//
// The point of running these against `fixtures/application/sigil-chat.yaml`
// rather than a synthetic config is that the allow-list's headline claim is
// about this deployment: codex/sol is authored and stays authored, and after
// this change it is unreachable until David enables it.

import { describe, expect, it } from "vitest"

import {
  authoredModelPresets,
  isSelectableModelPreset,
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
