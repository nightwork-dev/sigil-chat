import { GONK_AUTH_INFO_PRINCIPAL } from "@gonk/tool-registry-mcp"
import { checkBearer } from "@gonk/tool-registry-mcp/http"
import type { ToolRegistry } from "@gonk/tool-registry"
import { createAgentWebMcpHandler } from "@zigil/agent-gonk"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import type { ScopeAuthorizationPolicy } from "@workspace/agent-contracts/scope-authorization"

import {
  authenticateScopeDelegation,
  authorizeSigilMcpRequest,
  createContainerScopeAuthorizationPolicy,
  type SessionScopeOwnerLookup,
} from "./auth.js"
import {
  createScopeAccessCheck,
  getArtifactStore,
  SessionArtifactStore,
} from "./artifact-store.js"
import {
  formatScopeHeader,
  normalizeScopeHeaders,
  SIGIL_SCOPE_AUTH_INFO_KEY,
  SIGIL_SCOPE_HEADER,
  SIGIL_SESSION_SCOPE_AUTH_INFO_KEY,
  SIGIL_SESSION_SCOPE_HEADER,
} from "./artifact-scope.js"
import { getProjectWorkspaceRegistries } from "../../agent/agent/lib/project-workspace-registries.js"
import { MirkAgentThreadScopeOwnerRegistry } from "../../agent/agent/lib/agent-thread-scope-owners.js"
import type { ScopeGrantRegistry } from "../../agent/agent/lib/scope-grant-registry.js"
import { createSigilRegistry } from "./registry.js"
import type { ContainerRegistries } from "./registry/containers.js"

export function createSigilMcpHandler({
  apiKey,
  port,
  portlessUrl = process.env.PORTLESS_URL,
  configuredAllowedHosts = process.env.GONK_ALLOWED_HOSTS,
  containers,
  sessionOwners,
  scopeAuthorization,
  source,
}: {
  apiKey: string
  port: number
  portlessUrl?: string
  configuredAllowedHosts?: string
  containers?: ContainerRegistries & {
    grants?: Pick<ScopeGrantRegistry, "listActive">
  }
  sessionOwners?: SessionScopeOwnerLookup
  scopeAuthorization?: ScopeAuthorizationPolicy
  /** Test/composition seam; production uses the complete Sigil registry. */
  source?: ToolRegistry
}) {
  const resolvedContainers = containers ?? createSigilRegistryContainers()
  const resolvedSessionOwners = sessionOwners ?? createSessionOwnerLookup()
  const authorization =
    scopeAuthorization ??
    createContainerScopeAuthorizationPolicy(
      resolvedContainers,
      resolvedSessionOwners,
    )
  const artifacts = new SessionArtifactStore(getArtifactStore(), {
    // Artifact operations reached from MCP are part of an already-authorized
    // tool invocation, not a browser read. Keep this distinct from the web
    // read boundary so a read-only grant cannot call tools and a tool grant
    // cannot be mistaken for a direct read grant.
    canAccessScope: createScopeAccessCheck(authorization, "tool"),
  })
  return createAgentWebMcpHandler({
    source:
      source ??
      createSigilRegistry(
        undefined,
        undefined,
        undefined,
        artifacts,
        undefined,
        resolvedContainers,
      ),
    serverName: "sigil-chat-gonk",
    serverVersion: "0.0.1",
    allowedHosts: [
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      "sigil-chat-gonk.localhost:1355",
      ...(portlessUrl ? [new URL(portlessUrl).host] : []),
      // Deployment hostnames (e.g. compose service names) join via env.
      ...(configuredAllowedHosts?.split(",").map((h) => h.trim())
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
      const delegated = await authenticateScopeDelegation({
        policy: authorization,
        proof: request.headers.get(AGENT_SCOPE_PROOF_HEADER) ?? undefined,
        scope: resourceScope,
        secret: apiKey,
      })
      if (resourceScope && !delegated) return null
      return {
        token: token ?? "",
        clientId: "sigil-chat-agent",
        scopes: [],
        extra: {
          [GONK_AUTH_INFO_PRINCIPAL]: delegated
            ? {
                id: delegated.principalId,
                kind: "human",
                identity: {
                  issuer: "sigil-chat",
                  subject: delegated.principalId,
                  method: "custom:scope-delegation",
                },
                roles: ["member"],
                scopes: [formatScopeHeader(delegated.scope)!],
              }
            : {
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

function createSessionOwnerLookup(): SessionScopeOwnerLookup {
  let store: MirkAgentThreadScopeOwnerRegistry | undefined
  return {
    owns(sessionId, principalId) {
      // Tests and container-only callers do not pay to open the Mirk backend;
      // a session proof is the only path that needs the durable owner record.
      store ??= new MirkAgentThreadScopeOwnerRegistry()
      return store.owns(sessionId, principalId)
    },
  }
}

function createSigilRegistryContainers(): ContainerRegistries & {
  grants?: Pick<ScopeGrantRegistry, "listActive">
} {
  // Avoid a package-level registry open until this handler actually starts.
  // `createSigilRegistry` uses the same default when no explicit fixture is
  // supplied; keeping resolution here lets the policy and tool registry share
  // the exact same authoritative records.
  return getProjectWorkspaceRegistries()
}
