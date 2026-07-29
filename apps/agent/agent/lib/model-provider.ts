import type { LanguageModel } from "ai"
import { experimental_chatgpt } from "eve/models/openai"

import {
  normalizeSigilAgentModelConfig,
  type NormalizedSigilAgentModelConfig,
  type SigilAgentModelConfig,
} from "@workspace/runtime-env/config"

import { createOpenAICompatibleChatModel } from "./openai-compatible-model"

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

const DEFAULT_CONTEXT_WINDOW_TOKENS = 200_000

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
    const apiKey = readOptionalCredential(model, options.env)
    return {
      contextWindowTokens,
      display: display(model),
      model: createOpenAICompatibleChatModel({
        apiKey,
        baseUrl: requireBaseUrl(model),
        fetch: options.fetch,
        model: model.model,
      }),
    }
  }

  const apiKey = readRequiredCredential(model, options.env)
  void apiKey
  return {
    contextWindowTokens,
    display: display(model),
    model: hostedGatewayModelId(model),
  }
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
  if (model.provider === "openai-compatible") {
    const envName = model.apiKeyEnv
    return envName === undefined || hasEnvValue(options.env, envName)
  }
  return hasEnvValue(options.env, defaultApiKeyEnv(model.provider))
}

function hostedGatewayModelId(model: NormalizedSigilAgentModelConfig): string {
  return model.model.startsWith(`${model.provider}/`)
    ? model.model
    : `${model.provider}/${model.model}`
}

function readOptionalCredential(
  model: NormalizedSigilAgentModelConfig,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (model.apiKeyEnv === undefined) return undefined
  return readEnvValue(env, model.apiKeyEnv)
}

function readRequiredCredential(
  model: NormalizedSigilAgentModelConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const envName = model.apiKeyEnv ?? defaultApiKeyEnv(model.provider)
  const value = readEnvValue(env, envName)
  if (value !== undefined) return value
  throw new MissingModelCredentialError(model.provider, envName)
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
        : hostedGatewayModelId(model),
    provider: model.provider,
    source: model.source,
  }
}
