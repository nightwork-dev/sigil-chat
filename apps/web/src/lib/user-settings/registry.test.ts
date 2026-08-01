import { describe, expect, it } from "vitest"

import {
  SETTINGS_REGISTRY,
  defineSetting,
  getSettingDefinition,
  isKnownSettingKey,
  isScopeAllowed,
  validateSettingValue,
} from "./registry"

describe("SETTINGS_REGISTRY", () => {
  it("rejects unknown keys", () => {
    expect(isKnownSettingKey("appearance.theme")).toBe(true)
    expect(isKnownSettingKey("not.a.real.key")).toBe(false)
    expect(isKnownSettingKey("__proto__")).toBe(false)
  })

  it("rejects invalid values for a known key", () => {
    expect(validateSettingValue("appearance.mode", "dark")).toBe(true)
    expect(validateSettingValue("appearance.mode", "gamma-ray")).toBe(false)
    expect(validateSettingValue("appearance.reducedMotion", true)).toBe(true)
    expect(validateSettingValue("appearance.reducedMotion", "yes")).toBe(false)
    expect(validateSettingValue("agent.toolApprovalDefault", "always")).toBe(
      true,
    )
    expect(validateSettingValue("agent.toolApprovalDefault", "sometimes")).toBe(
      false,
    )
    expect(
      validateSettingValue("agent.toolApprovalOverrides", {
        "sigil-read-file": "always",
      }),
    ).toBe(true)
    expect(
      validateSettingValue("agent.toolApprovalOverrides", {
        "sigil-read-file": "sometimes",
      }),
    ).toBe(false)
  })

  it("declares which scope tiers each key allows", () => {
    expect(isScopeAllowed("appearance.theme", "user")).toBe(true)
    expect(isScopeAllowed("appearance.theme", "workspace")).toBe(false)
    expect(isScopeAllowed("workspace.panelState", "workspace")).toBe(true)
    expect(isScopeAllowed("workspace.panelState", "user")).toBe(false)
  })

  it("carries a registered product default for every key", () => {
    for (const key of [
      "appearance.theme",
      "appearance.mode",
      "appearance.reducedMotion",
      "agent.toolApprovalDefault",
      "agent.toolApprovalOverrides",
      "agent.activeChannelId",
      "workspace.lastChannel",
      "workspace.panelState",
    ] as const) {
      const definition = getSettingDefinition(key)
      expect(definition.isValid(definition.defaultValue)).toBe(true)
    }
  })

  it("makes scope-composition algebra explicit for every setting", () => {
    for (const definition of Object.values(SETTINGS_REGISTRY)) {
      expect(definition.allowedScopeKinds.length).toBeGreaterThan(0)
      expect(definition.mergeMode).toBeDefined()
      expect(typeof definition.allowsPersonalOverride).toBe("boolean")
      expect(typeof definition.affectsSecurity).toBe("boolean")
    }

    const appearance = getSettingDefinition("appearance.mode")
    expect(appearance.allowedContributingLinkKinds).toEqual([
      "contributes-defaults",
    ])
    expect(appearance.allowsPersonalOverride).toBe(true)
    expect(appearance.affectsSecurity).toBe(false)

    const panelState = getSettingDefinition("workspace.panelState")
    expect(panelState.allowedScopeKinds).toEqual(["workspace"])
    expect(panelState.allowsPersonalOverride).toBe(false)
  })

  it("rejects a security definition that could widen through personal or linked input", () => {
    expect(() =>
      defineSetting({
        key: "security.example",
        allowedScopes: ["user"] as const,
        allowedScopeKinds: ["installation", "personal"] as const,
        allowedContributingLinkKinds: ["contributes-defaults"] as const,
        mergeMode: "replace" as const,
        allowsPersonalOverride: true,
        affectsSecurity: true,
        defaultValue: "locked",
        isValid: (value: unknown): value is string => typeof value === "string",
      }),
    ).toThrow(/cannot permit personal or linked contributions/)
  })
})

describe("roadmap.goalStoryIds", () => {
  it("accepts a list of story ids and rejects anything else", () => {
    expect(validateSettingValue("roadmap.goalStoryIds", [])).toBe(true)
    expect(
      validateSettingValue("roadmap.goalStoryIds", ["SC.15", "MEM.5"]),
    ).toBe(true)

    expect(validateSettingValue("roadmap.goalStoryIds", "SC.15")).toBe(false)
    expect(validateSettingValue("roadmap.goalStoryIds", [42])).toBe(false)
    expect(validateSettingValue("roadmap.goalStoryIds", [""])).toBe(false)
  })

  it("rejects ids that could escape the roadmap store's directory", () => {
    // The same shape the store's own id guard enforces: these are used to look
    // up stories, so a traversal-ish id must never survive validation.
    expect(validateSettingValue("roadmap.goalStoryIds", ["../secret"])).toBe(
      false,
    )
    expect(validateSettingValue("roadmap.goalStoryIds", ["a/b"])).toBe(false)
    expect(validateSettingValue("roadmap.goalStoryIds", ["__proto__"])).toBe(
      false,
    )
  })

  it("caps how many goals may be pinned", () => {
    const many = Array.from({ length: 65 }, (_, index) => `S${index}`)
    expect(
      validateSettingValue("roadmap.goalStoryIds", many.slice(0, 64)),
    ).toBe(true)
    expect(validateSettingValue("roadmap.goalStoryIds", many)).toBe(false)
  })
})
