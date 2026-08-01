// Usage aggregates, hosted in Eve for the same reason model endpoints are
// (see model-endpoints.ts): Eve is the process that owns the ledger, and
// "owner-gated" (acceptance criterion 3) is a web-app concept Eve cannot
// verify on its own, so the shared binding secret is what lets this route
// trust that the caller's web server already checked.
//
// The route is read-only and answers the whole ledger's current rollups —
// aggregation happens once, on write, in usage-ledger.ts, not here.

import { createHash, timingSafeEqual } from "node:crypto"

import { GET, type HttpRouteDefinition } from "eve/channels"
import type { AuthFn } from "eve/channels/auth"

import {
  normalizeSigilAgentModelPresets,
  type SigilAgentConfig,
} from "@workspace/runtime-env/config"

import type { UsageAggregates, UsageLedgerRepository } from "./usage-ledger"

/** Kept in sync with the client relay in apps/web/src/lib/usage.server.ts. */
export const USAGE_RELAY_SECRET_HEADER = "x-sigil-usage-relay"

export interface UsageEndpointRouteOptions {
  /** Shared web↔Eve binding secret. An absent secret disables the route. */
  readonly relaySecret?: string
}

export interface UsageModelDescriptor {
  readonly presetId: string
  readonly label: string
  readonly provider: string
  readonly modelId: string
  readonly isDeploymentDefault: boolean
}

export function createUsageEndpointRoutes(
  authenticate: AuthFn<Request>,
  agent: SigilAgentConfig,
  ledger: UsageLedgerRepository,
  options: UsageEndpointRouteOptions = {},
): HttpRouteDefinition[] {
  return [
    GET("/sigil/v1/usage", async (request) => {
      if (!(await authenticate(request))) {
        return json({ error: "unauthorized" }, 401)
      }
      if (!hasRelayAuthorization(request, options.relaySecret)) {
        return json({ error: "forbidden" }, 403)
      }
      const aggregates = ledger.aggregates()
      return json({
        generatedAt: new Date().toISOString(),
        models: describeModels(agent),
        aggregates,
      } satisfies UsageEndpointPayload)
    }),
  ]
}

export interface UsageEndpointPayload {
  readonly generatedAt: string
  readonly models: readonly UsageModelDescriptor[]
  readonly aggregates: UsageAggregates
}

function describeModels(agent: SigilAgentConfig): UsageModelDescriptor[] {
  return normalizeSigilAgentModelPresets(agent).map((preset) => ({
    presetId: preset.id,
    label: preset.label,
    provider: preset.provider,
    modelId: preset.model,
    isDeploymentDefault: preset.isDeploymentDefault,
  }))
}

function hasRelayAuthorization(
  request: Request,
  secret: string | undefined,
): boolean {
  const expected = secret?.trim()
  if (!expected) return false
  const presented = request.headers.get(USAGE_RELAY_SECRET_HEADER)?.trim()
  if (!presented) return false
  return secretsMatch(presented, expected)
}

/** Constant-time and length-independent, matching model-endpoints.ts. */
function secretsMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(presented).digest(),
    createHash("sha256").update(expected).digest(),
  )
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  })
}
