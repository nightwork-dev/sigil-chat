import { describe, expect, it } from "vitest"

import {
  hasConfiguredModelCredential,
  MissingModelCredentialError,
  resolveSigilAgentModel,
} from "./model-provider"

describe("Sigil agent model provider resolution", () => {
  it("keeps bare model slugs on the local Codex subscription path", () => {
    const resolved = resolveSigilAgentModel("gpt-5.6-terra")

    expect(resolved.display).toEqual({
      id: "gpt-5.6-terra",
      provider: "codex",
      source: "bare-slug",
    })
    expect(resolved.contextWindowTokens).toBe(200_000)
    expect(typeof resolved.model).toBe("object")
  })

  it("creates a local OpenAI-compatible model without requiring a secret", async () => {
    const resolved = resolveSigilAgentModel({
      provider: "openai-compatible",
      model: "llama3.1:8b",
      baseUrl: "http://127.0.0.1:11434/v1",
      contextWindowTokens: 131_072,
    })

    expect(resolved.display).toEqual({
      id: "llama3.1:8b",
      provider: "openai-compatible",
      source: "object",
    })
    expect(resolved.contextWindowTokens).toBe(131_072)
    expect(await hasConfiguredModelCredential({
      provider: "openai-compatible",
      model: "llama3.1:8b",
      baseUrl: "http://127.0.0.1:11434/v1",
    })).toBe(true)
  })

  it("fails closed with the selected hosted provider's env var name", async () => {
    expect(() =>
      resolveSigilAgentModel(
        {
          provider: "openrouter",
          model: "anthropic/claude-sonnet-4.6",
        },
        { env: {} },
      ),
    ).toThrow(MissingModelCredentialError)

    await expect(
      hasConfiguredModelCredential(
        {
          provider: "openrouter",
          model: "anthropic/claude-sonnet-4.6",
        },
        { env: {} },
      ),
    ).resolves.toBe(false)
  })

  it("uses Eve's native gateway string route for hosted non-Codex providers", () => {
    const resolved = resolveSigilAgentModel(
      {
        provider: "anthropic",
        model: "claude-sonnet-4.6",
      },
      { env: { SIGIL_MODEL_ANTHROPIC_API_KEY: "test-key" } },
    )

    expect(resolved.model).toBe("anthropic/claude-sonnet-4.6")
    expect(resolved.display.id).toBe("anthropic/claude-sonnet-4.6")
  })
})
