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
- Before MDL.1 repair, the app did not have public provider packages installed
  as direct dependencies. MDL.1 now adds `@ai-sdk/openai-compatible`,
  `@ai-sdk/anthropic`, and `@openrouter/ai-sdk-provider`.

## Consequence for MDL.1

Sigil Chat cannot truthfully call sibling Eve factories for OpenRouter,
Anthropic, or local OpenAI-compatible endpoints today; Eve does not publish
those factories in `0.27.5`. The implementation therefore uses the installed
surface this way:

1. `provider: codex` continues to use `experimental_chatgpt()`.
2. `provider: openai-compatible` uses the official
   `@ai-sdk/openai-compatible` `createOpenAICompatible()` factory with the
   fixture `baseUrl`.
3. `provider: openrouter` uses the official `@openrouter/ai-sdk-provider`
   `createOpenRouter()` factory and passes the configured environment key into
   that provider instance.
4. `provider: anthropic` uses the official `@ai-sdk/anthropic`
   `createAnthropic()` factory and passes the configured environment key into
   that provider instance.
5. Provider secrets remain environment-only. The fixture may name an
   `apiKeyEnv`; it never stores the key value.

AI Gateway remains a separate possible future provider. MDL.1 deliberately does
not read `SIGIL_MODEL_*` credentials and return an AI Gateway string model id;
that would hide which credential actually authorizes the hosted request.

## Verification hooks

- `pnpm --filter sigil-chat-agent test:openai-compatible-smoke` starts a local
  fake OpenAI-compatible server, boots Eve against a temporary fixture, posts to
  `/eve/v1/session`, proves Eve exposed the native `todo` tool to the provider,
  receives a todo tool call, executes it, and sends the tool result back to the
  model.
- `pnpm --filter sigil-chat-agent test:hosted-provider-smoke` is the live
  hosted-provider proof. It skips cleanly when no configured
  `SIGIL_MODEL_OPENROUTER_API_KEY` or `SIGIL_MODEL_ANTHROPIC_API_KEY` is
  present; when credentials are present it boots Eve with the selected direct
  hosted provider and submits a real message turn.

If Eve later publishes first-class provider factories, `apps/agent/agent/lib/model-provider.ts`
is the single application seam to swap hosted/local provider construction
without changing the checked-in fixture contract.
