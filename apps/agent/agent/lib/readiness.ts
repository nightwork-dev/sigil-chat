import { GET, type HttpRouteDefinition } from "eve/channels"
import type { AuthFn } from "eve/channels/auth"

import { hasCodexModelAuth } from "./model-auth.mjs"

export interface ReadinessRouteOptions {
  hasModelAuth?: () => Promise<boolean>
  applicationToolCount?: () => number
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
      ? readinessResponse(200, "ready", options.applicationToolCount?.())
      : readinessResponse(503, "unavailable")
  })
}

function readinessResponse(
  status: number,
  value: string,
  applicationToolCount?: number,
): Response {
  return Response.json(
    {
      status: value,
      ...(typeof applicationToolCount === "number"
        ? {
            applicationTools: {
              count: applicationToolCount,
              status: applicationToolCount > 0 ? "ready" : "unavailable",
            },
          }
        : {}),
    },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  )
}
