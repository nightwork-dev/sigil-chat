// Server half of the model endpoint surface: owner gate + same-origin relay
// to Eve. The browser never talks to Eve directly (repo rule), and Eve is the
// only process that holds model credentials, so this file is the whole
// boundary — it checks the caller is the owner, forwards with the shared
// binding secret, and returns Eve's answer unchanged apart from validation.
//
// The secret is not decoration: owner role is a web-app concept Eve cannot
// verify, so presenting it is how this process asserts "I already checked".
// Eve refuses both model-endpoint routes without it.

import { readOptionalSecretFromFile } from "@workspace/runtime-env/server"
import {
  joinRuntimeUrl,
  readRuntimeTopology,
} from "@workspace/runtime-env/topology"

import { getEveBearerToken, getSession, requireOwner } from "./auth/session"
import { persistDiscoveredModels } from "./discovered-models.server"
import {
  parseProbeInput,
  type ModelCatalogStatus,
  type ModelEndpointInventory,
  type ModelEndpointProbeInput,
  type ModelEndpointProbeResult,
  type ModelEndpointReasoningConfig,
  type ModelEndpointRecord,
  type ModelProviderRecord,
} from "./model-endpoints"

/** Kept in sync with `MODEL_RELAY_SECRET_HEADER` in apps/agent. */
const MODEL_RELAY_SECRET_HEADER = "x-sigil-model-relay"

export async function readModelEndpointInventory(): Promise<ModelEndpointInventory> {
  requireOwner(await getSession())
  const response = await callEve("/sigil/v1/model-endpoints", { method: "GET" })
  if (!response.ok) {
    throw new Error(
      `The agent runtime could not list model endpoints (HTTP ${response.status}).`,
    )
  }
  const providers = projectProviders(await response.json())
  // Eve is the only process that can reach a provider's catalog endpoint —
  // it holds the credential. The create-time allow-list check runs
  // synchronously in THIS process, though, so a discovered model has to be
  // cached here as a side effect of the owner viewing the inventory, rather
  // than resolved live on every session-creation request. This is the only
  // writer of that cache; it is owner-gated by `requireOwner` above.
  persistDiscoveredModels(providers)
  return { providers }
}

export async function probeModelEndpointThroughEve(
  input: ModelEndpointProbeInput,
): Promise<ModelEndpointProbeResult> {
  requireOwner(await getSession())
  // Re-validate rather than trust the caller-side shape: this function is
  // also reachable from server code that did not go through the validator.
  const { baseUrl } = parseProbeInput(input)

  const response = await callEve("/sigil/v1/model-endpoints/probe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseUrl }),
  })
  if (!response.ok) {
    throw new Error(
      `The agent runtime refused the probe (HTTP ${response.status}).`,
    )
  }
  return projectProbeResult(await response.json())
}

async function callEve(path: string, init: RequestInit): Promise<Response> {
  const secret = readOptionalSecretFromFile(
    process.env,
    "SIGIL_AGENT_BINDING_SECRET",
  )
  if (!secret) {
    throw new Error(
      "Model endpoint management is unavailable: SIGIL_AGENT_BINDING_SECRET is not configured for this deployment.",
    )
  }
  const origin = readRuntimeTopology(process.env).eveOrigin
  const bearer = await getEveBearerToken()
  return fetch(joinRuntimeUrl(origin, path), {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bearer}`,
      [MODEL_RELAY_SECRET_HEADER]: secret,
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  })
}

export function projectProviders(payload: unknown): ModelProviderRecord[] {
  if (typeof payload !== "object" || payload === null) return []
  const providers = (payload as { providers?: unknown }).providers
  if (!Array.isArray(providers)) return []
  return providers.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return []
    const entry = candidate as Record<string, unknown>
    const id = text(entry.id)
    if (!id) return []
    const credential =
      typeof entry.credential === "object" && entry.credential !== null
        ? (entry.credential as Record<string, unknown>)
        : {}
    const envName = text(credential.envName)
    const baseUrl = text(entry.baseUrl)
    const models = Array.isArray(entry.models)
      ? entry.models.flatMap(projectModel)
      : []
    // A provider with no readable models has nothing to offer; dropping it
    // keeps an empty block off the screen.
    if (models.length === 0) return []
    const catalog = projectCatalogStatus(entry.catalog)
    return [
      {
        id,
        label: text(entry.label) || id,
        kind: text(entry.kind) || "unknown",
        ...(baseUrl ? { baseUrl } : {}),
        enabled: entry.enabled !== false,
        credential: {
          ...(envName ? { envName } : {}),
          required: credential.required === true,
          present: credential.present === true,
        },
        models,
        ...(catalog ? { catalog } : {}),
      },
    ]
  })
}

function projectModel(candidate: unknown): ModelEndpointRecord[] {
  if (typeof candidate !== "object" || candidate === null) return []
  const entry = candidate as Record<string, unknown>
  const id = text(entry.id)
  const model = text(entry.model)
  if (!id || !model) return []
  return [
    {
      id,
      label: text(entry.label) || model,
      model,
      capability: text(entry.capability) || "chat",
      enabled: entry.enabled !== false,
      contextWindowTokens:
        typeof entry.contextWindowTokens === "number" &&
        Number.isFinite(entry.contextWindowTokens)
          ? entry.contextWindowTokens
          : 0,
      isDeploymentDefault: entry.isDeploymentDefault === true,
      ...(entry.discovered === true ? { discovered: true } : {}),
      ...(projectReasoning(entry.reasoning)
        ? { reasoning: projectReasoning(entry.reasoning) }
        : {}),
      fastMode: entry.fastMode === true,
    },
  ]
}

function projectCatalogStatus(value: unknown): ModelCatalogStatus | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const entry = value as Record<string, unknown>
  const checkedAt = text(entry.checkedAt)
  if (!checkedAt) return undefined
  const error = text(entry.error)
  return { checkedAt, ...(error ? { error } : {}) }
}

function projectReasoning(
  candidate: unknown,
): ModelEndpointReasoningConfig | undefined {
  if (typeof candidate !== "object" || candidate === null) return undefined
  const entry = candidate as Record<string, unknown>
  const levels = Array.isArray(entry.levels)
    ? entry.levels.filter((level): level is string => typeof level === "string")
    : []
  const defaultLevel = text(entry.default)
  if (levels.length === 0 || !defaultLevel) return undefined
  return { levels, default: defaultLevel }
}

export function projectProbeResult(payload: unknown): ModelEndpointProbeResult {
  if (typeof payload !== "object" || payload === null) {
    return {
      reachable: false,
      models: [],
      error: "The agent runtime returned an unreadable probe result.",
      credential: { present: false },
    }
  }
  const entry = payload as Record<string, unknown>
  const credential =
    typeof entry.credential === "object" && entry.credential !== null
      ? (entry.credential as Record<string, unknown>)
      : {}
  const envName = text(credential.envName)
  const status = entry.status
  const error = text(entry.error)
  return {
    reachable: entry.reachable === true,
    ...(typeof status === "number" && Number.isFinite(status)
      ? { status }
      : {}),
    models: Array.isArray(entry.models)
      ? entry.models.filter((id): id is string => typeof id === "string")
      : [],
    ...(error ? { error } : {}),
    credential: {
      ...(envName ? { envName } : {}),
      present: credential.present === true,
    },
  }
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : ""
}
