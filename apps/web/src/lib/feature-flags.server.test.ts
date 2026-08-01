import { describe, expect, it } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import { OwnerRequiredError } from "./auth/session"
import { FeatureFlagRefusedError } from "./feature-flags"
import {
  applyOwnerFeatureFlag,
  type FeatureFlagDependencies,
} from "./feature-flags.server"
import { FEATURE_FLAG_OVERRIDES_KEY } from "./installation-settings/registry"
import { InstallationSettingsStore } from "./installation-settings/store"

const DECLARED_ID = "surfaces.reducerStudio"

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

function dependencies(): FeatureFlagDependencies {
  return { store: new InstallationSettingsStore({ kv: memoryKv() }) }
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

describe("applyOwnerFeatureFlag", () => {
  it("lets the owner flip a declared flag", () => {
    const deps = dependencies()
    const result = applyOwnerFeatureFlag(
      session("owner"),
      { id: DECLARED_ID, enabled: false },
      deps,
    )
    expect(result.find((flag) => flag.id === DECLARED_ID)?.enabled).toBe(false)
    expect(deps.store.get(FEATURE_FLAG_OVERRIDES_KEY)).toEqual({
      [DECLARED_ID]: false,
    })
  })

  // The reason a flag is installation-scoped and owner-gated rather than a
  // per-user preference: the refusal has to happen on the server rather than
  // by hiding the control. Delete `requireOwner` from applyOwnerFeatureFlag
  // and this test goes red.
  it("refuses a member's write and leaves the overrides untouched", () => {
    const deps = dependencies()
    expect(() =>
      applyOwnerFeatureFlag(
        session("member"),
        { id: DECLARED_ID, enabled: false },
        deps,
      ),
    ).toThrow(OwnerRequiredError)
    expect(deps.store.get(FEATURE_FLAG_OVERRIDES_KEY)).toEqual({})
  })

  it("refuses an anonymous write", () => {
    const deps = dependencies()
    expect(() =>
      applyOwnerFeatureFlag(null, { id: DECLARED_ID, enabled: false }, deps),
    ).toThrow()
    expect(deps.store.get(FEATURE_FLAG_OVERRIDES_KEY)).toEqual({})
  })

  it("refuses an id nobody declared", () => {
    const deps = dependencies()
    expect(() =>
      applyOwnerFeatureFlag(
        session("owner"),
        { id: "not.a.real.flag", enabled: true },
        deps,
      ),
    ).toThrow(FeatureFlagRefusedError)
    expect(deps.store.get(FEATURE_FLAG_OVERRIDES_KEY)).toEqual({})
  })

  it("re-validates the request rather than trusting its caller", () => {
    const deps = dependencies()
    expect(() =>
      applyOwnerFeatureFlag(
        session("owner"),
        { id: DECLARED_ID, enabled: true, extra: "field" } as never,
        deps,
      ),
    ).toThrow(FeatureFlagRefusedError)
  })
})
