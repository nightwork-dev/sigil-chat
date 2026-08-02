import { describe, expect, it } from "vitest"

import type { SigilAuthSession } from "./auth/server"
import { isFeatureFlagEnabled } from "./feature-flags"
import { FEATURE_FLAG_OVERRIDES_KEY } from "./installation-settings/registry"
import { InstallationSettingsStore } from "./installation-settings/store"
import { VERIFICATION_QUEUE_FLAG } from "./verification-queue"
import { resolveVerificationQueueAccess } from "./verification-queue.server"

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

function session(role: "owner" | "member"): SigilAuthSession {
  return {
    session: { id: "session-1", userId: "user-1" },
    user: { id: "user-1", email: "user@sigil.test", name: "User", role },
  } as unknown as SigilAuthSession
}

/**
 * The flag verdict as the server actually computes it — through the declared
 * registry and a real installation-settings store, not a hand-passed boolean.
 * Nothing here re-implements the evaluation the shipping code does.
 */
function flagVerdict(override?: boolean): boolean {
  const store = new InstallationSettingsStore({ kv: memoryKv() })
  if (override !== undefined) {
    store.set(FEATURE_FLAG_OVERRIDES_KEY, {
      [VERIFICATION_QUEUE_FLAG]: override,
    })
  }
  return isFeatureFlagEnabled(
    VERIFICATION_QUEUE_FLAG,
    store.get(FEATURE_FLAG_OVERRIDES_KEY),
  )
}

describe("resolveVerificationQueueAccess (VQ.1)", () => {
  // Acceptance criterion 1, the "flag off = fully unmounted" half. The flag
  // ships default-off, so an untouched installation must not mount the overlay
  // even for the owner. Delete the flag check from
  // resolveVerificationQueueAccess and this test goes red.
  it("refuses the owner while the flag is off", () => {
    expect(
      resolveVerificationQueueAccess(session("owner"), flagVerdict()),
    ).toBe(false)
    expect(
      resolveVerificationQueueAccess(session("owner"), flagVerdict(false)),
    ).toBe(false)
  })

  it("mounts for the owner once the flag is turned on", () => {
    expect(
      resolveVerificationQueueAccess(session("owner"), flagVerdict(true)),
    ).toBe(true)
  })

  // The other half of criterion 1: non-owners never see the surface, and the
  // flag being on does not buy a member their way in. Delete the role check
  // and this test goes red.
  it("refuses a member and an anonymous visitor even with the flag on", () => {
    expect(
      resolveVerificationQueueAccess(session("member"), flagVerdict(true)),
    ).toBe(false)
    expect(resolveVerificationQueueAccess(null, flagVerdict(true))).toBe(false)
  })
})

describe("dev.verificationQueue declaration", () => {
  it("is declared and ships off, so landing the surface changes nothing until an owner acts", () => {
    expect(flagVerdict()).toBe(false)
  })
})
