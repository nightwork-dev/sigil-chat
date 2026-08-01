import { describe, expect, it } from "vitest"

import { buildReasoningProviderOptions } from "./reasoning-provider-options"

describe("buildReasoningProviderOptions", () => {
  it("returns undefined when nothing was requested", () => {
    expect(buildReasoningProviderOptions("codex", {})).toBeUndefined()
  })

  it("maps a codex reasoning level to providerOptions.openai.reasoningEffort", () => {
    expect(
      buildReasoningProviderOptions("codex", { reasoningLevel: "high" }),
    ).toEqual({ openai: { reasoningEffort: "high" } })
  })

  it("translates Sigil's 'off' label to the provider's 'none' vocabulary", () => {
    expect(
      buildReasoningProviderOptions("codex", { reasoningLevel: "off" }),
    ).toEqual({ openai: { reasoningEffort: "none" } })
  })

  it("maps codex fast mode to service_tier flex", () => {
    expect(buildReasoningProviderOptions("codex", { fastMode: true })).toEqual({
      openai: { serviceTier: "flex" },
    })
  })

  it("combines reasoning level and fast mode in one codex call", () => {
    expect(
      buildReasoningProviderOptions("codex", {
        reasoningLevel: "xhigh",
        fastMode: true,
      }),
    ).toEqual({ openai: { reasoningEffort: "xhigh", serviceTier: "flex" } })
  })

  it("does not forward fast mode when it was not requested", () => {
    expect(
      buildReasoningProviderOptions("codex", {
        reasoningLevel: "low",
        fastMode: false,
      }),
    ).toEqual({ openai: { reasoningEffort: "low" } })
  })

  it("maps anthropic 'off' to a disabled thinking block", () => {
    expect(
      buildReasoningProviderOptions(
        "anthropic",
        { reasoningLevel: "off" },
        ["off", "low", "medium", "high"],
      ),
    ).toEqual({ anthropic: { thinking: { type: "disabled" } } })
  })

  it("maps an anthropic level to a budget by position within the declared levels", () => {
    const result = buildReasoningProviderOptions(
      "anthropic",
      { reasoningLevel: "high" },
      ["off", "low", "medium", "high"],
    )
    expect(result).toMatchObject({
      anthropic: { thinking: { type: "enabled" } },
    })
    const budget = (
      result as {
        anthropic: { thinking: { budgetTokens: number } }
      }
    ).anthropic.thinking.budgetTokens
    // Highest declared non-"off" level should land at the top of the budget
    // range (see the file's MIN/MAX constants).
    expect(budget).toBe(32_000)
  })

  it("returns undefined for openai-compatible and openrouter — no known mapping yet", () => {
    expect(
      buildReasoningProviderOptions("openai-compatible", {
        reasoningLevel: "medium",
      }),
    ).toBeUndefined()
    expect(
      buildReasoningProviderOptions("openrouter", { fastMode: true }),
    ).toBeUndefined()
  })
})
