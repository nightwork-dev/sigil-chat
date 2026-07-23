import type { ToolRegistry } from "@gonk/tool-registry"
import { GET, type HttpRouteDefinition } from "eve/channels"
import type { AuthFn } from "eve/channels/auth"

export function createApplicationToolCatalogRoute(
  authenticate: AuthFn<Request>,
  registry: ToolRegistry,
): HttpRouteDefinition {
  return GET("/sigil/v1/application-tools", async (request) => {
    const principal = await authenticate(request)
    if (!principal) {
      return Response.json(
        { error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      )
    }
    return Response.json(
      {
        // This route projects authenticated inventory for the capabilities UI.
        // Callability remains request-bound and is decided only by Eve's native
        // dynamic-tool resolver for the active session, scope, and persona.
        tools: registry.list().map((tool) => ({
          description: tool.description,
          name: tool.name,
          runtimeStatus: "discoverable",
        })),
      },
      { headers: { "cache-control": "no-store" } },
    )
  })
}
