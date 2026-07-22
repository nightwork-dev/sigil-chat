import { describe, expect, it } from "vitest"

import { canDisconnectAuthAccount } from "./accounts"

describe("canDisconnectAuthAccount", () => {
  it("prevents removing the only remaining sign-in account", () => {
    expect(canDisconnectAuthAccount(0)).toBe(false)
    expect(canDisconnectAuthAccount(1)).toBe(false)
    expect(canDisconnectAuthAccount(2)).toBe(true)
  })
})
