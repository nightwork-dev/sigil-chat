import { describe, expect, it } from "vitest"

import {
  applyModelEnablement,
  isModelEnabledForNewSessions,
  ModelEnablementRefusedError,
  parseSetModelEnabledRequest,
  type ModelEnablementCandidate,
} from "./model-enablement"

const DEPLOYMENT_DEFAULT: ModelEnablementCandidate = {
  id: "deployment-default",
  enabled: true,
  isDeploymentDefault: true,
}

const LUNA: ModelEnablementCandidate = {
  id: "codex/luna",
  enabled: true,
  isDeploymentDefault: false,
}

const RETIRED: ModelEnablementCandidate = {
  id: "codex/retired",
  // The fixture author's veto.
  enabled: false,
  isDeploymentDefault: false,
}

describe("allow-list policy", () => {
  // The headline property: a model the fixture authors is NOT selectable
  // merely because it exists. Before the allow-list, every authored preset
  // resolved — this assertion is what that change bought.
  it("refuses an authored model until an owner enables it", () => {
    expect(isModelEnabledForNewSessions(LUNA, [])).toBe(false)
    expect(isModelEnabledForNewSessions(LUNA, ["codex/luna"])).toBe(true)
  })

  it("exposes only the deployment default on a fresh installation", () => {
    const authored = [DEPLOYMENT_DEFAULT, LUNA, RETIRED]
    expect(
      authored
        .filter((candidate) => isModelEnabledForNewSessions(candidate, []))
        .map((candidate) => candidate.id),
    ).toEqual(["deployment-default"])
  })

  // An author retiring a model must not depend on every deployment remembering
  // to un-enable it, so the fixture's `enabled: false` wins over a stale
  // installation record naming the same id.
  it("lets an authored veto beat an installation-enabled record", () => {
    expect(isModelEnabledForNewSessions(RETIRED, ["codex/retired"])).toBe(false)
  })

  it("keeps the deployment default selectable without a stored record", () => {
    expect(isModelEnabledForNewSessions(DEPLOYMENT_DEFAULT, [])).toBe(true)
  })
})

const SOL: ModelEnablementCandidate = {
  id: "codex/sol",
  enabled: true,
  isDeploymentDefault: false,
}

describe("applyModelEnablement", () => {
  it("round-trips one model through enable and disable", () => {
    const enabled = applyModelEnablement([], [LUNA], true)
    expect(enabled).toEqual(["codex/luna"])
    expect(applyModelEnablement(enabled, [LUNA], false)).toEqual([])
  })

  it("keeps the set stable when the same model is enabled twice", () => {
    expect(applyModelEnablement(["codex/luna"], [LUNA], true)).toEqual([
      "codex/luna",
    ])
  })

  // The provider block's control: a whole provider on or off in one write.
  it("enables and disables a whole provider without touching another", () => {
    const enabled = applyModelEnablement(["deepseek/chat"], [LUNA, SOL], true)
    expect(enabled).toEqual(["codex/luna", "codex/sol", "deepseek/chat"])
    expect(applyModelEnablement(enabled, [LUNA, SOL], false)).toEqual([
      "deepseek/chat",
    ])
  })

  it("refuses to disable the deployment default", () => {
    expect(() =>
      applyModelEnablement(["codex/luna"], [DEPLOYMENT_DEFAULT], false),
    ).toThrow(ModelEnablementRefusedError)
  })

  it("refuses to enable a model the fixture disabled", () => {
    expect(() => applyModelEnablement([], [RETIRED], true)).toThrow(
      ModelEnablementRefusedError,
    )
  })

  // All-or-nothing: a bulk write that contains one refused id must not leave a
  // partially applied set behind.
  it("refuses a whole batch when one member is refused", () => {
    expect(() => applyModelEnablement([], [LUNA, RETIRED], true)).toThrow(
      ModelEnablementRefusedError,
    )
  })

  it("never stores the deployment default, whose availability is policy", () => {
    expect(applyModelEnablement([], [DEPLOYMENT_DEFAULT], true)).toEqual([])
  })

  it("refuses an empty batch", () => {
    expect(() => applyModelEnablement([], [], true)).toThrow(
      ModelEnablementRefusedError,
    )
  })
})

describe("parseSetModelEnabledRequest", () => {
  it("trims the id and keeps the boolean", () => {
    expect(
      parseSetModelEnabledRequest({
        presetIds: [" codex/luna "],
        enabled: true,
      }),
    ).toEqual({ presetIds: ["codex/luna"], enabled: true })
  })

  it("refuses a body that smuggles anything besides an id and a flag", () => {
    for (const extra of [
      { baseUrl: "http://127.0.0.1:1234/v1" },
      { apiKeyEnv: "SIGIL_MODEL_DEEPSEEK_API_KEY" },
      { userId: "someone-else" },
    ]) {
      expect(() =>
        parseSetModelEnabledRequest({
          presetIds: ["codex/luna"],
          enabled: true,
          ...extra,
        }),
      ).toThrow(ModelEnablementRefusedError)
    }
  })

  it("refuses a missing or non-boolean flag", () => {
    expect(() =>
      parseSetModelEnabledRequest({ presetIds: ["codex/luna"] }),
    ).toThrow(ModelEnablementRefusedError)
    expect(() =>
      parseSetModelEnabledRequest({
        presetIds: ["codex/luna"],
        enabled: "yes",
      }),
    ).toThrow(ModelEnablementRefusedError)
  })
})
