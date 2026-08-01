// Provider-aware mapping from a fixture-declared reasoning level / fast-mode
// flag to the AI SDK provider options that actually carry them, per MDL.4
// point 2: "one function per provider kind", living beside
// resolveSigilAgentModel rather than inside session-model.ts's resolution
// flow, so each provider's translation is independently readable and
// testable.
//
// What is verified vs. inferred, stated plainly rather than papered over:
//
//   - codex: VERIFIED against the @ai-sdk/openai schema bundled inside the
//     pinned `eve` dependency (2026-07-31): `providerOptions.openai.
//     reasoningEffort` accepts exactly `"none" | "minimal" | "low" |
//     "medium" | "high" | "xhigh" | "max"`, and the Codex subscription model
//     (`experimental_chatgpt`) is built on that same `.responses()` adapter,
//     so the parameter reaches the same request-shaping code a normal OpenAI
//     Responses call would use.
//   - codex fast mode: UNVERIFIED against the live Codex backend.
//     `serviceTier: "flex"` is a real, schema-valid OpenAI Responses
//     parameter (also confirmed in the bundled schema) that trades latency
//     for cost, and the Codex model's normalizeCodexCallOptions() forwards
//     providerOptions.openai through unchanged — but whether ChatGPT
//     subscription auth honors `service_tier` the way a metered API key does
//     is not something a unit test can prove; the Codex backend is not a
//     public contract (see eve's own `experimental_chatgpt` doc comment).
//     Ship it because it is the only schema-valid lever with this shape, and
//     because MDL.4 point 5 asks for the seam to be reported honestly rather
//     than left silently unimplemented — this comment is that report.
//   - anthropic / openai-compatible / openrouter: no fixture preset declares
//     `reasoning` or `fastMode` on these providers yet, so these mappings are
//     unexercised by any live model. They are written from the same bundled
//     schema evidence (`providerOptions.anthropic.thinking` accepts a
//     `budgetTokens`; openai-compatible has no reasoning schema at all in the
//     bundled adapter) rather than left as a TODO, so the next preset that
//     declares reasoning on one of these providers gets a real mapping
//     instead of a silent no-op — but they are equally unverified against a
//     live backend.

import type { AgentModelOptionsDefinition } from "eve"

import type { SigilAgentModelProvider } from "@workspace/runtime-env/config"

export interface ReasoningRequestSelection {
  /** A level drawn from the resolved preset's declared `reasoning.levels`. */
  readonly reasoningLevel?: string
  /** Only meaningful when the resolved preset declares `fastMode: true`. */
  readonly fastMode?: boolean
}

/** Sigil's own label for "no extra reasoning effort" — see the codex mapping. */
const REASONING_OFF = "off"

/**
 * Values the bundled @ai-sdk/openai schema actually accepts for
 * `reasoningEffort`. Sigil authors "off" in the fixture (readable, and
 * consistent with how "off" reads as a fast-mode-adjacent level); the
 * provider's own vocabulary calls that "none".
 */
function codexReasoningEffort(level: string): string {
  return level === REASONING_OFF ? "none" : level
}

/**
 * codex → OpenAI Responses `providerOptions.openai`.
 *
 * Both the Codex subscription model and any future direct OpenAI provider
 * built on `@ai-sdk/openai` read this namespace, so this same function
 * covers both — there is currently only one authored provider of this kind
 * (`codex`), but the mapping is keyed by AI SDK provider option namespace,
 * not by Sigil's fixture provider kind name.
 */
function codexProviderOptions(
  selection: ReasoningRequestSelection,
): Record<string, unknown> | undefined {
  const openai: Record<string, unknown> = {}
  if (selection.reasoningLevel !== undefined) {
    openai.reasoningEffort = codexReasoningEffort(selection.reasoningLevel)
  }
  if (selection.fastMode) {
    openai.serviceTier = "flex"
  }
  return Object.keys(openai).length > 0 ? { openai } : undefined
}

/**
 * anthropic → `providerOptions.anthropic.thinking`.
 *
 * The Anthropic AI SDK adapter wants a token budget, not a named level, so
 * this maps Sigil's ordered level vocabulary onto budgets by POSITION within
 * the preset's declared `levels` list rather than by matching level names —
 * "medium" means nothing to Anthropic's API, but "the middle of however many
 * levels this preset declared" is still a coherent request. `fastMode` has no
 * known Anthropic equivalent, so it is dropped rather than guessed at.
 */
function anthropicProviderOptions(
  selection: ReasoningRequestSelection,
  levels: readonly string[] | undefined,
): Record<string, unknown> | undefined {
  if (selection.reasoningLevel === undefined) return undefined
  if (selection.reasoningLevel === REASONING_OFF) {
    return { anthropic: { thinking: { type: "disabled" } } }
  }
  const index = levels?.indexOf(selection.reasoningLevel) ?? -1
  if (index < 0 || !levels || levels.length <= 1) return undefined
  // Spread the non-"off" levels evenly across a conservative budget range;
  // this is a coarse translation, not a tuned one — see the file header.
  const MIN_BUDGET_TOKENS = 1_024
  const MAX_BUDGET_TOKENS = 32_000
  const fraction = index / (levels.length - 1)
  const budgetTokens = Math.round(
    MIN_BUDGET_TOKENS + fraction * (MAX_BUDGET_TOKENS - MIN_BUDGET_TOKENS),
  )
  return {
    anthropic: { thinking: { type: "enabled", budgetTokens } },
  }
}

/**
 * openai-compatible / openrouter → no known reasoning parameter in the
 * bundled adapters. Returning undefined here is the correct behavior for
 * "declared but this provider kind cannot honor it", not a stub — a preset
 * on either of these providers should not declare `reasoning` today.
 */
function unmappedProviderOptions(): Record<string, unknown> | undefined {
  return undefined
}

/**
 * Build the `modelOptions.providerOptions` block for a resolved reasoning
 * selection, or undefined when there is nothing to forward (no level chosen
 * and fast mode not requested, or the provider has no known mapping).
 */
export function buildReasoningProviderOptions(
  provider: SigilAgentModelProvider,
  selection: ReasoningRequestSelection,
  declaredLevels?: readonly string[],
): AgentModelOptionsDefinition["providerOptions"] | undefined {
  if (selection.reasoningLevel === undefined && !selection.fastMode) {
    return undefined
  }
  const providerOptions =
    provider === "codex"
      ? codexProviderOptions(selection)
      : provider === "anthropic"
        ? anthropicProviderOptions(selection, declaredLevels)
        : unmappedProviderOptions()
  return providerOptions as AgentModelOptionsDefinition["providerOptions"]
}
