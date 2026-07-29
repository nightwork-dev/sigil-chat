# MDL.1 Eve model surface inventory

> Date: 2026-07-29
> Status: implementation evidence
> Story: MDL.1

This note records the live installed Eve model/provider surface before Sigil
Chat's model-provider contract landed. It is tracked in the product repo so the
roadmap coordinator can copy the findings into the external MDL.1 story without
this lane editing the shared roadmap store.

## Installed package evidence

- `apps/agent/package.json` depends on `eve@0.27.5` and `ai@^7.0.26`.
- After `pnpm install --frozen-lockfile`, the resolved package is
  `eve@0.27.5` and the AI SDK resolved to `ai@7.0.31`.
- Eve's public `exports` map contains exactly one model factory subpath:
  `eve/models/openai`.
- `eve/models/openai` exports exactly one public function:
  `experimental_chatgpt(model?: string): LanguageModel`.
- `experimental_chatgpt()` creates a model billed through the local ChatGPT /
  Codex subscription and accepts a bare OpenAI slug or an `openai/`-prefixed
  slug. It rejects any other provider-qualified id.
- Eve's public `defineAgent` model type accepts either an AI Gateway model id
  string or an AI SDK-compatible `LanguageModel` instance.
- Eve's own type documentation describes string model ids as the native hosted
  route through AI Gateway, and direct provider instances as external AI SDK
  provider instances.
- The app did not have public `@ai-sdk/openai` or `@ai-sdk/anthropic`
  provider packages installed as direct dependencies.

## Consequence for MDL.1

Sigil Chat cannot truthfully call sibling Eve factories for OpenRouter,
Anthropic, or local OpenAI-compatible endpoints today; Eve does not publish
those factories in `0.27.5`. The implementation therefore uses the installed
surface this way:

1. `provider: codex` continues to use `experimental_chatgpt()`.
2. Hosted non-Codex providers use Eve's native string model route, e.g.
   `anthropic/claude-sonnet-4.6` or `openrouter/<provider>/<model>`.
3. Local OpenAI-compatible servers use a small app-owned AI SDK `LanguageModel`
   adapter over `/chat/completions`, because a local base URL cannot be
   represented by Eve's hosted string route.
4. Provider secrets remain environment-only. The fixture may name an
   `apiKeyEnv`; it never stores the key value.

If Eve later publishes first-class provider factories, `apps/agent/agent/lib/model-provider.ts`
is the single application seam to swap hosted/local provider construction
without changing the checked-in fixture contract.
