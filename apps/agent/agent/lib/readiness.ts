import { GET, type HttpRouteDefinition } from "eve/channels"
import type { AuthFn } from "eve/channels/auth"

import { hasCodexModelAuth } from "./model-auth.mjs"

export interface ReadinessRouteOptions {
  hasModelAuth?: () => Promise<boolean>
}

export function createReadinessRoute(
  authenticate: AuthFn<Request>,
  options: ReadinessRouteOptions = {},
): HttpRouteDefinition {
  const modelAuth = options.hasModelAuth ?? hasCodexModelAuth
  return GET("/sigil/v1/readiness", async (request) => {
    const principal = await authenticate(request)
    if (!principal) return readinessResponse(401, "unauthorized")
    return (await modelAuth())
      ? readinessResponse(200, "ready")
      : readinessResponse(503, "unavailable")
  })
}

function readinessResponse(status: number, value: string): Response {
  return Response.json(
    { status: value },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  )
}
