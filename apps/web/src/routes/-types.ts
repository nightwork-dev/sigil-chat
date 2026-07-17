// Shared route types
// Prefix with `-` so TanStack Router ignores this file during route generation.

/** Stats returned by GET /api/stats */
export interface StatsData {
  requests: number
  latency: number
  errorRate: number
  uptime: number
  updatedAt: string
}
