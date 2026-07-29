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

  it("fails local OpenAI-compatible startup when a configured apiKeyEnv is missing", async () => {
    const config = {
      provider: "openai-compatible" as const,
      model: "local-model",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKeyEnv: "SIGIL_MODEL_LOCAL_API_KEY",
    }

    expect(() => resolveSigilAgentModel(config, { env: {} })).toThrow(
      MissingModelCredentialError,
    )
    await expect(
      hasConfiguredModelCredential(config, { env: {} }),
    ).resolves.toBe(false)
    await expect(
      hasConfiguredModelCredential(config, {
        env: { SIGIL_MODEL_LOCAL_API_KEY: "local-secret" },
      }),
    ).resolves.toBe(true)
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

  it("creates an official direct Anthropic provider model for hosted non-Codex providers", () => {
    const resolved = resolveSigilAgentModel(
      {
        provider: "anthropic",
        model: "claude-sonnet-4.6",
      },
      { env: { SIGIL_MODEL_ANTHROPIC_API_KEY: "test-key" } },
    )

    expect(typeof resolved.model).toBe("object")
    expect((resolved.model as { provider?: string }).provider).toBe(
      "anthropic.messages",
    )
    expect((resolved.model as { modelId?: string }).modelId).toBe(
      "claude-sonnet-4.6",
    )
    expect(resolved.display.id).toBe("anthropic/claude-sonnet-4.6")
  })

  it("creates an official direct OpenRouter provider model using the configured key", () => {
    const resolved = resolveSigilAgentModel(
      {
        provider: "openrouter",
        model: "openrouter/anthropic/claude-sonnet-4.6",
        apiKeyEnv: "SIGIL_MODEL_OPENROUTER_TEST_KEY",
      },
      { env: { SIGIL_MODEL_OPENROUTER_TEST_KEY: "test-key" } },
    )

    expect(typeof resolved.model).toBe("object")
    expect((resolved.model as { provider?: string }).provider).toBe(
      "openrouter",
    )
    expect((resolved.model as { modelId?: string }).modelId).toBe(
      "anthropic/claude-sonnet-4.6",
    )
    expect(resolved.display.id).toBe(
      "openrouter/anthropic/claude-sonnet-4.6",
    )
  })
})
