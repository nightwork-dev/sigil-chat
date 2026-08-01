// Usage aggregates (MDL.3): the browser's view of the ledger Eve owns.
//
// Same shape as model-endpoints.ts: a typed relay to Eve, owner-gated in the
// server half, React Query on top. This module owns the browser-safe types
// and query hooks; usage.server.ts owns the relay and the owner check.

import { queryOptions, useQuery } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

export interface UsageAggregateBucket {
  turnCount: number
  reportedTurnCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  pricedTurnCount: number
  costMicros: number
  currency: "usd"
}

export interface UsageAggregateEntry {
  key: string
  bucket: UsageAggregateBucket
}

export interface UsageAggregates {
  app: UsageAggregateBucket
  byUser: readonly UsageAggregateEntry[]
  byModel: readonly UsageAggregateEntry[]
  byDay: readonly UsageAggregateEntry[]
  bySession: readonly UsageAggregateEntry[]
}

export interface UsageModelDescriptor {
  presetId: string
  label: string
  provider: string
  modelId: string
  isDeploymentDefault: boolean
}

export interface UsagePayload {
  generatedAt: string
  models: readonly UsageModelDescriptor[]
  aggregates: UsageAggregates
}

export const fetchUsage = createServerFn({ method: "GET" }).handler(
  async (): Promise<UsagePayload> =>
    (await import("./usage.server")).readUsageThroughEve(),
)

export const usageKeys = {
  all: () => ["usage"] as const,
}

export function usageQueryOptions() {
  return queryOptions({
    queryKey: usageKeys.all(),
    queryFn: () => fetchUsage(),
    staleTime: 5_000,
    retry: false,
  })
}

export function useUsage() {
  return useQuery(usageQueryOptions())
}

/** `costMicros` -> a display dollar figure. Undefined stays undefined. */
export function microsToUsd(micros: number): number {
  return micros / 1_000_000
}

export function formatUsd(micros: number): string {
  return microsToUsd(micros).toLocaleString(undefined, {
    style: "currency",
    currency: "usd",
    minimumFractionDigits: micros % 1_000_000 === 0 ? 0 : 2,
    maximumFractionDigits: 4,
  })
}

export function formatTokenCount(tokens: number): string {
  return tokens.toLocaleString()
}
