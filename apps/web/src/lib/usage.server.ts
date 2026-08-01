// Server half of the usage surface: owner gate + same-origin relay to Eve.
// See model-endpoints.server.ts — this is the same shape. Eve owns the
// ledger and the read; the web app's only job here is proving the caller is
// the owner before forwarding.

import { readOptionalSecretFromFile } from "@workspace/runtime-env/server"
import {
  joinRuntimeUrl,
  readRuntimeTopology,
} from "@workspace/runtime-env/topology"

import { getEveBearerToken, getSession, requireOwner } from "./auth/session"
import type { UsagePayload } from "./usage"

/** Kept in sync with `USAGE_RELAY_SECRET_HEADER` in apps/agent. */
const USAGE_RELAY_SECRET_HEADER = "x-sigil-usage-relay"

export async function readUsageThroughEve(): Promise<UsagePayload> {
  requireOwner(await getSession())
  const secret = readOptionalSecretFromFile(
    process.env,
    "SIGIL_AGENT_BINDING_SECRET",
  )
  if (!secret) {
    throw new Error(
      "Usage reporting is unavailable: SIGIL_AGENT_BINDING_SECRET is not configured for this deployment.",
    )
  }
  const origin = readRuntimeTopology(process.env).eveOrigin
  const bearer = await getEveBearerToken()
  const response = await fetch(joinRuntimeUrl(origin, "/sigil/v1/usage"), {
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bearer}`,
      [USAGE_RELAY_SECRET_HEADER]: secret,
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw new Error(
      `The agent runtime could not report usage (HTTP ${response.status}).`,
    )
  }
  return projectUsagePayload(await response.json())
}

export function projectUsagePayload(payload: unknown): UsagePayload {
  if (typeof payload !== "object" || payload === null) {
    return emptyPayload()
  }
  const entry = payload as Record<string, unknown>
  const generatedAt = text(entry.generatedAt) || new Date().toISOString()
  const models = Array.isArray(entry.models)
    ? entry.models.flatMap(projectModel)
    : []
  const aggregates = projectAggregates(entry.aggregates)
  return { generatedAt, models, aggregates }
}

function projectModel(candidate: unknown) {
  if (typeof candidate !== "object" || candidate === null) return []
  const entry = candidate as Record<string, unknown>
  const presetId = text(entry.presetId)
  if (!presetId) return []
  return [
    {
      presetId,
      label: text(entry.label) || presetId,
      provider: text(entry.provider) || "unknown",
      modelId: text(entry.modelId) || presetId,
      isDeploymentDefault: entry.isDeploymentDefault === true,
    },
  ]
}

function projectAggregates(candidate: unknown) {
  if (typeof candidate !== "object" || candidate === null) {
    return emptyAggregates()
  }
  const entry = candidate as Record<string, unknown>
  return {
    app: projectBucket(entry.app),
    byUser: projectEntries(entry.byUser),
    byModel: projectEntries(entry.byModel),
    byDay: projectEntries(entry.byDay),
    bySession: projectEntries(entry.bySession),
  }
}

function projectEntries(candidate: unknown) {
  if (!Array.isArray(candidate)) return []
  return candidate.flatMap((item) => {
    if (typeof item !== "object" || item === null) return []
    const entry = item as Record<string, unknown>
    const key = text(entry.key)
    if (!key) return []
    return [{ key, bucket: projectBucket(entry.bucket) }]
  })
}

function projectBucket(candidate: unknown) {
  const entry =
    typeof candidate === "object" && candidate !== null
      ? (candidate as Record<string, unknown>)
      : {}
  return {
    turnCount: num(entry.turnCount),
    reportedTurnCount: num(entry.reportedTurnCount),
    inputTokens: num(entry.inputTokens),
    outputTokens: num(entry.outputTokens),
    cacheReadTokens: num(entry.cacheReadTokens),
    cacheWriteTokens: num(entry.cacheWriteTokens),
    pricedTurnCount: num(entry.pricedTurnCount),
    costMicros: num(entry.costMicros),
    currency: "usd" as const,
  }
}

function emptyAggregates() {
  return {
    app: projectBucket(undefined),
    byUser: [],
    byModel: [],
    byDay: [],
    bySession: [],
  }
}

function emptyPayload(): UsagePayload {
  return {
    generatedAt: new Date().toISOString(),
    models: [],
    aggregates: emptyAggregates(),
  }
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : ""
}
