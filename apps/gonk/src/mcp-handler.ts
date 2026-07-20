import { GONK_AUTH_INFO_PRINCIPAL } from "@gonk/tool-registry-mcp"
import { checkBearer } from "@gonk/tool-registry-mcp/http"
import { createAgentWebMcpHandler } from "@zigil/agent-gonk"

import { authorizeSigilMcpRequest } from "./auth.js"
import {
  normalizeScopeHeaders,
  SIGIL_SCOPE_AUTH_INFO_KEY,
  SIGIL_SCOPE_HEADER,
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
      // Deployment hostnames (e.g. compose service names) join via env.
      ...(process.env.GONK_ALLOWED_HOSTS?.split(",").map((h) => h.trim())
        .filter(Boolean) ?? []),
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
      const resourceScope = normalizeScopeHeaders(
        request.headers.get(SIGIL_SCOPE_HEADER) ?? undefined,
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
          ...(resourceScope
            ? {
                [SIGIL_SCOPE_AUTH_INFO_KEY]: resourceScope,
                // Keep the old extra populated for adapters that still read it.
                ...(resourceScope.tier === "session"
                  ? { [SIGIL_SESSION_SCOPE_AUTH_INFO_KEY]: resourceScope.id }
                  : {}),
              }
            : {}),
        },
      }
    },
    makeContext: (extra) => {
      const resourceScope = extra.authInfo?.extra?.[
        SIGIL_SCOPE_AUTH_INFO_KEY
      ]
      const legacySessionScope = extra.authInfo?.extra?.[
        SIGIL_SESSION_SCOPE_AUTH_INFO_KEY
      ]
      return {
        host:
          resourceScope !== undefined
            ? { resourceScope }
            : typeof legacySessionScope === "string"
              ? { sessionScope: legacySessionScope }
              : undefined,
      }
    },
    authorize: authorizeSigilMcpRequest,
    enableDnsRebindingProtection: true,
    enableJsonResponse: true,
    writeToolPolicy: "permissive",
  })
}
