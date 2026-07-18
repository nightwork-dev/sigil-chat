import { GONK_AUTH_INFO_PRINCIPAL } from "@gonk/tool-registry-mcp"
import { checkBearer } from "@gonk/tool-registry-mcp/http"
import { createAgentWebMcpHandler } from "@zigil/agent-gonk"

import { authorizeSigilMcpRequest } from "./auth.js"
import {
  normalizeSessionScope,
  SIGIL_SESSION_SCOPE_AUTH_INFO_KEY,
  SIGIL_SESSION_SCOPE_HEADER,
} from "./artifact-scope.js"
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
    authenticate: async (request) => {
      if (
        !checkBearer(request.headers.get("authorization") ?? undefined, apiKey)
      ) {
        return null
      }
      const token = request.headers.get("authorization")?.replace(
        /^Bearer\s+/i,
        "",
      )
      const sessionScope = normalizeSessionScope(
        request.headers.get(SIGIL_SESSION_SCOPE_HEADER) ?? undefined,
      )
      return {
        token: token ?? "",
        clientId: "sigil-chat-agent",
        scopes: [],
        extra: {
          [GONK_AUTH_INFO_PRINCIPAL]: {
            id: "service:static-bearer:sigil-chat-agent",
            kind: "service",
            identity: {
              issuer: "sigil-chat",
              subject: "sigil-chat-agent",
              method: "service-token",
            },
            roles: ["agent"],
            scopes: [],
          },
          ...(sessionScope
            ? { [SIGIL_SESSION_SCOPE_AUTH_INFO_KEY]: sessionScope }
            : {}),
        },
      }
    },
    makeContext: (extra) => {
      const sessionScope = extra.authInfo?.extra?.[
        SIGIL_SESSION_SCOPE_AUTH_INFO_KEY
      ]
      return {
        host:
          typeof sessionScope === "string" ? { sessionScope } : undefined,
      }
    },
    authorize: authorizeSigilMcpRequest,
    enableDnsRebindingProtection: true,
    enableJsonResponse: true,
    writeToolPolicy: "permissive",
  })
}
