import { describe, expect, it } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import { OwnerRequiredError } from "./auth/session"
import { ENABLED_MODELS_KEY } from "./installation-settings/registry"
import { InstallationSettingsStore } from "./installation-settings/store"
import { ModelEnablementRefusedError } from "./model-enablement"
import {
  applyOwnerModelEnablement,
  type ModelEnablementDependencies,
} from "./model-enablement.server"

/** An in-memory KV standing in for the project-tier store. */
function memoryKv() {
  const values = new Map<string, unknown>()
  return {
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => {
      values.set(key, value)
    },
    patch: () => {
      throw new Error("unused")
    },
    delete: (key: string) => {
      values.delete(key)
    },
    list: () => [...values.keys()].sort(),
    entries: () =>
      [...values.entries()]
        .map(([key, value]) => ({ key, value }))
        .sort((left, right) => left.key.localeCompare(right.key)),
  }
}

function dependencies(): ModelEnablementDependencies {
  return {
    store: new InstallationSettingsStore({ kv: memoryKv() }),
    presets: () => [
      { id: "deployment-default", enabled: true, isDeploymentDefault: true },
      { id: "codex/luna", enabled: true, isDeploymentDefault: false },
      { id: "codex/retired", enabled: false, isDeploymentDefault: false },
    ],
  }
}

function session(role: "owner" | "member"): SigilAuthSession {
  return {
    session: { id: "session-1", userId: "user-1" },
    user: {
      id: "user-1",
      email: "user@sigil.test",
      name: "User",
      role,
    },
  } as unknown as SigilAuthSession
}

describe("applyOwnerModelEnablement", () => {
  it("lets the owner enable a model", () => {
    const deps = dependencies()
    expect(
      applyOwnerModelEnablement(
        session("owner"),
        { presetIds: ["codex/luna"], enabled: true },
        deps,
      ),
    ).toEqual(["codex/luna"])
    expect(deps.store.get(ENABLED_MODELS_KEY)).toEqual(["codex/luna"])
  })

  // The reason the enabled set is installation-scoped rather than per-user:
  // a member must not be able to enable an expensive model, and the refusal
  // has to happen on the server rather than by hiding the control.
  it("refuses a member's write and leaves the set untouched", () => {
    const deps = dependencies()
    expect(() =>
      applyOwnerModelEnablement(
        session("member"),
        { presetIds: ["codex/luna"], enabled: true },
        deps,
      ),
    ).toThrow(OwnerRequiredError)
    expect(deps.store.get(ENABLED_MODELS_KEY)).toEqual([])
  })

  it("refuses an anonymous write", () => {
    const deps = dependencies()
    expect(() =>
      applyOwnerModelEnablement(
        null,
        { presetIds: ["codex/luna"], enabled: true },
        deps,
      ),
    ).toThrow()
    expect(deps.store.get(ENABLED_MODELS_KEY)).toEqual([])
  })

  it("refuses an id this deployment does not author", () => {
    const deps = dependencies()
    expect(() =>
      applyOwnerModelEnablement(
        session("owner"),
        { presetIds: ["anthropic/fable"], enabled: true },
        deps,
      ),
    ).toThrow(ModelEnablementRefusedError)
  })

  it("refuses disabling the deployment default", () => {
    const deps = dependencies()
    expect(() =>
      applyOwnerModelEnablement(
        session("owner"),
        { presetIds: ["deployment-default"], enabled: false },
        deps,
      ),
    ).toThrow(ModelEnablementRefusedError)
  })

  it("refuses enabling a model the fixture disabled", () => {
    const deps = dependencies()
    expect(() =>
      applyOwnerModelEnablement(
        session("owner"),
        { presetIds: ["codex/retired"], enabled: true },
        deps,
      ),
    ).toThrow(ModelEnablementRefusedError)
    expect(deps.store.get(ENABLED_MODELS_KEY)).toEqual([])
  })

  it("re-validates the request rather than trusting its caller", () => {
    const deps = dependencies()
    expect(() =>
      applyOwnerModelEnablement(
        session("owner"),
        {
          presetIds: ["codex/luna"],
          enabled: true,
          baseUrl: "http://127.0.0.1:1234/v1",
        } as never,
        deps,
      ),
    ).toThrow(ModelEnablementRefusedError)
  })
})
