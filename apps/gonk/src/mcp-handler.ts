import { createAgentWebMcpHandler } from "@zigil/agent-gonk"

import { authorizeSigilMcpRequest } from "./auth.js"
import { createSigilRegistry } from "./registry.js"

export function createSigilMcpHandler({
  apiKey,
  port,
}: {
  apiKey: string
  port: number
}) {
  return createAgentWebMcpHandler({
    source: createSigilRegistry(),
    serverName: "sigil-chat-gonk",
    serverVersion: "0.0.1",
    allowedHosts: [
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      "sigil-chat-gonk.localhost:1355",
    ],
    apiKey,
    authorize: authorizeSigilMcpRequest,
    enableDnsRebindingProtection: true,
    enableJsonResponse: true,
    writeToolPolicy: "permissive",
  })
}
