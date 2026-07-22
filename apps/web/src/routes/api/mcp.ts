// Route ancestry: __root → /api/mcp
// Chrome: none — public Streamable HTTP MCP gateway for user-owned API keys

import { createFileRoute } from "@tanstack/react-router"

import { handleExternalMcpRequest } from "../../lib/external-mcp.server"

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      DELETE: async ({ request }) => handleExternalMcpRequest(request),
      GET: async ({ request }) => handleExternalMcpRequest(request),
      POST: async ({ request }) => handleExternalMcpRequest(request),
    },
  },
})
