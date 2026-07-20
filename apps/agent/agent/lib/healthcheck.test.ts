import { describe, expect, it } from "vitest"

import {
  checkAgentReadiness,
  hasCodexAccessToken,
} from "../../scripts/healthcheck.mjs"

describe("agent readiness", () => {
  it("requires a non-empty Codex model access token", () => {
    expect(hasCodexAccessToken("not-json")).toBe(false)
    expect(hasCodexAccessToken(JSON.stringify({ tokens: {} }))).toBe(false)
    expect(
      hasCodexAccessToken(
        JSON.stringify({ tokens: { access_token: "model-session-token" } }),
      ),
    ).toBe(true)
  })

  it("requires both model auth and Eve runtime health", async () => {
    const read = async () =>
      JSON.stringify({ tokens: { access_token: "model-session-token" } })

    await expect(
      checkAgentReadiness({
        codexHome: "/runtime/codex",
        read,
        fetcher: async () => new Response(null, { status: 200 }),
      }),
    ).resolves.toBe(true)
    await expect(
      checkAgentReadiness({
        codexHome: "/runtime/codex",
        read,
        fetcher: async () => new Response(null, { status: 503 }),
      }),
    ).resolves.toBe(false)
  })
})
