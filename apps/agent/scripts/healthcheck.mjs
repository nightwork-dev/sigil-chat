import { fileURLToPath, pathToFileURL } from "node:url"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  hasCodexAccessToken,
  hasCodexModelAuth,
} from "../agent/lib/model-auth.mjs"

export { hasCodexAccessToken } from "../agent/lib/model-auth.mjs"

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
)

export async function readAgentReadiness(options = {}) {
  const model = await resolveHealthcheckModelConfig(options)
  const provider = model.provider
  if (!(await hasConfiguredModelCredential(model, options))) {
    return {
      status: "unavailable",
      checks: {
        modelAuth: "error",
        modelProvider: provider,
        eveRuntime: "unknown",
      },
      diagnostic: modelCredentialDiagnostic(model),
    }
  }

  const fetcher = options.fetcher ?? fetch
  const port = options.port ?? process.env.PORT ?? "3001"
  try {
    const response = await fetcher(`http://127.0.0.1:${port}/eve/v1/health`, {
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) {
      return {
        status: "unavailable",
        checks: {
          modelAuth: "ok",
          modelProvider: provider,
          eveRuntime: "error",
        },
        diagnostic: `Eve runtime health returned HTTP ${response.status}. Check the Eve process logs.`,
      }
    }
  } catch {
    return {
      status: "unavailable",
      checks: {
        modelAuth: "ok",
        modelProvider: provider,
        eveRuntime: "error",
      },
      diagnostic: `Eve runtime health did not respond on 127.0.0.1:${port}. Check the Eve process and PORT.`,
    }
  }

  return {
    status: "ready",
    checks: {
      modelAuth: "ok",
      modelProvider: provider,
      eveRuntime: "ok",
    },
  }
}

export async function checkAgentReadiness(options = {}) {
  return (await readAgentReadiness(options)).status === "ready"
}

async function resolveHealthcheckModelConfig(options) {
  if (options.modelConfig) return normalizeModelConfig(options.modelConfig)
  const configPath =
    options.configPath ??
    join(repositoryRoot, "fixtures", "application", "sigil-chat.yaml")
  const raw = await (options.readConfig ?? readFile)(configPath, "utf8")
  return normalizeModelConfig(readAgentModelFromYaml(raw))
}

function readAgentModelFromYaml(raw) {
  const lines = raw.split(/\r?\n/)
  const agentIndex = lines.findIndex((line) => /^agent:\s*$/.test(line))
  if (agentIndex < 0) return undefined
  const modelLine = lines
    .slice(agentIndex + 1)
    .find((line) => /^  model:/.test(line))
  if (!modelLine) return undefined
  const inlineValue = modelLine.slice(modelLine.indexOf(":") + 1).trim()
  if (inlineValue) return unquoteYamlScalar(inlineValue)
  const model = {}
  for (const line of lines.slice(agentIndex + 1)) {
    if (/^[^ \t#]/.test(line)) break
    const match = /^    ([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*$/.exec(line)
    if (!match) continue
    const [, key, value] = match
    model[key] =
      key === "contextWindowTokens"
        ? Number(value)
        : unquoteYamlScalar(value)
  }
  return model
}

function unquoteYamlScalar(value) {
  return value.replace(/^["']|["']$/g, "")
}

function normalizeModelConfig(value) {
  if (typeof value === "string" && value.trim()) {
    return { provider: "codex", model: value.trim(), source: "bare-slug" }
  }
  if (value && typeof value === "object") {
    return {
      provider: value.provider,
      model: value.model,
      baseUrl: value.baseUrl,
      apiKeyEnv: value.apiKeyEnv,
      source: "object",
    }
  }
  return { provider: "codex", model: "gpt-5.6-sol", source: "bare-slug" }
}

async function hasConfiguredModelCredential(model, options) {
  if (model.provider === "codex") return hasCodexModelAuth(options)
  if (model.provider === "openai-compatible") {
    return model.apiKeyEnv ? hasEnvValue(options.env, model.apiKeyEnv) : true
  }
  return hasEnvValue(options.env, model.apiKeyEnv ?? defaultApiKeyEnv(model))
}

function modelCredentialDiagnostic(model) {
  if (model.provider === "codex") {
    return "Codex model auth is unavailable. Run codex login --device-auth inside the Eve container as the runtime user."
  }
  const envName =
    model.provider === "openai-compatible"
      ? model.apiKeyEnv
      : model.apiKeyEnv ?? defaultApiKeyEnv(model)
  return envName
    ? `Model provider "${model.provider}" is missing ${envName}. Set ${envName} in the Eve runtime environment.`
    : `Model provider "${model.provider}" is not configured.`
}

function defaultApiKeyEnv(model) {
  return `SIGIL_MODEL_${String(model.provider).toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`
}

function hasEnvValue(env = process.env, name) {
  return typeof env?.[name] === "string" && env[name].trim().length > 0
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const readiness = await readAgentReadiness()
  process.stdout.write(`${JSON.stringify(readiness)}\n`)
  process.exitCode = readiness.status === "ready" ? 0 : 1
}
