import type { LanguageModel } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { experimental_chatgpt } from "eve/models/openai"

import {
  normalizeSigilAgentModelConfig,
  type NormalizedSigilAgentModelConfig,
  type SigilAgentModelConfig,
} from "@workspace/runtime-env/config"

export class MissingModelCredentialError extends Error {
  readonly envName: string
  readonly provider: string

  constructor(provider: string, envName: string) {
    super(
      `Model provider "${provider}" requires ${envName}. Set ${envName} in the Eve runtime environment or choose a configured provider.`,
    )
    this.name = "MissingModelCredentialError"
    this.provider = provider
    this.envName = envName
  }
}

export interface ResolvedSigilAgentModel {
  readonly contextWindowTokens: number
  readonly display: {
    readonly id: string
    readonly provider: string
    readonly source: "bare-slug" | "object"
  }
  readonly model: LanguageModel | string
}

export interface ResolveSigilAgentModelOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly fetch?: typeof fetch
}

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000

export function resolveSigilAgentModel(
  config: SigilAgentModelConfig,
  options: ResolveSigilAgentModelOptions = {},
): ResolvedSigilAgentModel {
  const model = normalizeSigilAgentModelConfig(config)
  const contextWindowTokens =
    model.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS

  if (model.provider === "codex") {
    return {
      contextWindowTokens,
      display: display(model),
      model: experimental_chatgpt(model.model),
    }
  }

  if (model.provider === "openai-compatible") {
    const apiKey = readConfiguredCredential(model, options.env)
    const provider = createOpenAICompatible({
      apiKey,
      baseURL: requireBaseUrl(model),
      fetch: options.fetch,
      name: "sigil-openai-compatible",
    })
    return {
      contextWindowTokens,
      display: display(model),
      model: provider(model.model) as LanguageModel,
    }
  }

  const apiKey = readRequiredCredential(model, options.env)
  if (model.provider === "openrouter") {
    const provider = createOpenRouter({
      apiKey,
      appName: "Sigil Chat",
      fetch: options.fetch,
    })
    return {
      contextWindowTokens,
      display: display(model),
      model: provider.chat(directHostedModelId(model)) as LanguageModel,
    }
  }

  if (model.provider === "anthropic") {
    const provider = createAnthropic({
      apiKey,
      fetch: options.fetch,
    })
    return {
      contextWindowTokens,
      display: display(model),
      model: provider.messages(directHostedModelId(model)) as LanguageModel,
    }
  }

  return assertNeverProvider(model.provider)
}

function assertNeverProvider(provider: never): never {
  throw new Error(`Unsupported model provider "${String(provider)}".`)
}

export async function hasConfiguredModelCredential(
  config: SigilAgentModelConfig,
  options: ResolveSigilAgentModelOptions & {
    readonly hasCodexModelAuth?: () => Promise<boolean>
  } = {},
): Promise<boolean> {
  const model = normalizeSigilAgentModelConfig(config)
  if (model.provider === "codex") {
    return options.hasCodexModelAuth?.() ?? false
  }
  return hasConfiguredCredential(model, options.env)
}

export interface ModelCredentialRequirement {
  /**
   * Environment variable this entry's credential is read from. A NAME, never
   * a value — this is safe to project to an operator UI. `undefined` means the
   * credential does not come from the environment (Codex reads the local
   * `codex login` session) or none is configured at all.
   */
  readonly envName?: string
  /** Whether the provider refuses to resolve without that credential. */
  readonly required: boolean
}

/**
 * Which credential an entry needs, without reading it.
 *
 * `hasConfiguredModelCredential` answers "is it there?"; this answers "what is
 * it, and does this provider insist on it?" so a settings surface can say
 * "SIGIL_MODEL_DEEPSEEK_API_KEY — missing" instead of an unexplained red mark.
 * Both derive the env name from the same policy below, so the UI can never
 * name a variable the resolver would not actually read.
 */
export function describeModelCredentialRequirement(
  config: SigilAgentModelConfig,
): ModelCredentialRequirement {
  const model = normalizeSigilAgentModelConfig(config)
  if (model.provider === "codex") return { required: true }
  if (model.provider === "openai-compatible") {
    return model.apiKeyEnv === undefined
      ? { required: false }
      : { envName: model.apiKeyEnv, required: true }
  }
  return { envName: apiKeyEnvForModel(model), required: true }
}

function displayModelId(model: NormalizedSigilAgentModelConfig): string {
  return model.model.startsWith(`${model.provider}/`)
    ? model.model
    : `${model.provider}/${model.model}`
}

function directHostedModelId(model: NormalizedSigilAgentModelConfig): string {
  return model.model.startsWith(`${model.provider}/`)
    ? model.model.slice(model.provider.length + 1)
    : model.model
}

function readConfiguredCredential(
  model: NormalizedSigilAgentModelConfig,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (model.apiKeyEnv === undefined) return undefined
  const value = readEnvValue(env, model.apiKeyEnv)
  if (value !== undefined) return value
  throw new MissingModelCredentialError(model.provider, model.apiKeyEnv)
}

function readRequiredCredential(
  model: NormalizedSigilAgentModelConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const envName = apiKeyEnvForModel(model)
  const value = readEnvValue(env, envName)
  if (value !== undefined) return value
  throw new MissingModelCredentialError(model.provider, envName)
}

function hasConfiguredCredential(
  model: NormalizedSigilAgentModelConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const envName =
    model.provider === "openai-compatible"
      ? model.apiKeyEnv
      : apiKeyEnvForModel(model)
  return envName === undefined || hasEnvValue(env, envName)
}

function apiKeyEnvForModel(model: NormalizedSigilAgentModelConfig): string {
  return model.apiKeyEnv ?? defaultApiKeyEnv(model.provider)
}

function defaultApiKeyEnv(provider: string): string {
  return `SIGIL_MODEL_${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`
}

function readEnvValue(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

function hasEnvValue(
  env: NodeJS.ProcessEnv = process.env,
  name: string,
): boolean {
  return readEnvValue(env, name) !== undefined
}

function requireBaseUrl(model: NormalizedSigilAgentModelConfig): string {
  if (model.baseUrl !== undefined) return model.baseUrl
  throw new Error(
    'Model provider "openai-compatible" requires agent.model.baseUrl.',
  )
}

function display(model: NormalizedSigilAgentModelConfig) {
  return {
    id:
      model.provider === "codex" || model.provider === "openai-compatible"
        ? model.model
        : displayModelId(model),
    provider: model.provider,
    source: model.source,
  }
}
