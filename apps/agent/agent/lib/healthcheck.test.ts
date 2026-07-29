import { describe, expect, it } from "vitest"

import {
  checkAgentReadiness,
  hasCodexAccessToken,
  readAgentReadiness,
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
        codexHome: "virtual-codex-home",
        read,
        fetcher: async () => new Response(null, { status: 200 }),
      }),
    ).resolves.toBe(true)
    await expect(
      checkAgentReadiness({
        codexHome: "virtual-codex-home",
        read,
        fetcher: async () => new Response(null, { status: 503 }),
      }),
    ).resolves.toBe(false)
  })

  it("reports actionable readiness diagnostics without token or path details", async () => {
    await expect(
      readAgentReadiness({
        codexHome: "/private/codex-home",
        read: async () => {
          throw new Error("missing /private/codex-home/auth.json")
        },
        fetcher: async () => new Response(null, { status: 200 }),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      checks: {
        modelAuth: "error",
        modelProvider: "codex",
        eveRuntime: "unknown",
      },
      diagnostic:
        "Codex model auth is unavailable. Run codex login --device-auth inside the Eve container as the runtime user.",
    })

    const read = async () =>
      JSON.stringify({ tokens: { access_token: "model-session-token" } })
    const report = await readAgentReadiness({
      codexHome: "virtual-codex-home",
      read,
      fetcher: async () => new Response(null, { status: 503 }),
    })

    expect(report).toEqual({
      status: "unavailable",
      checks: {
        modelAuth: "ok",
        modelProvider: "codex",
        eveRuntime: "error",
      },
      diagnostic:
        "Eve runtime health returned HTTP 503. Check the Eve process logs.",
    })
    expect(JSON.stringify(report)).not.toContain("model-session-token")
    expect(JSON.stringify(report)).not.toContain("/private")
  })

  it("fails closed with a named hosted provider credential", async () => {
    await expect(
      readAgentReadiness({
        env: {},
        fetcher: async () => new Response(null, { status: 200 }),
        modelConfig: {
          provider: "openrouter",
          model: "openrouter/anthropic/claude-sonnet-4.6",
        },
      } as never),
    ).resolves.toEqual({
      status: "unavailable",
      checks: {
        modelAuth: "error",
        modelProvider: "openrouter",
        eveRuntime: "unknown",
      },
      diagnostic:
        'Model provider "openrouter" is missing SIGIL_MODEL_OPENROUTER_API_KEY. Set SIGIL_MODEL_OPENROUTER_API_KEY in the Eve runtime environment.',
    })
  })

  it("treats local OpenAI-compatible models without apiKeyEnv as configured", async () => {
    await expect(
      checkAgentReadiness({
        fetcher: async () => new Response(null, { status: 200 }),
        modelConfig: {
          provider: "openai-compatible",
          model: "local-model",
          baseUrl: "http://127.0.0.1:11434/v1",
        },
      } as never),
    ).resolves.toBe(true)
  })
})
