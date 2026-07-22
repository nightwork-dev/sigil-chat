import { GONK_AUTH_INFO_PRINCIPAL } from "@gonk/tool-registry-mcp"
import { checkBearer } from "@gonk/tool-registry-mcp/http"
import type { ToolRegistry } from "@gonk/tool-registry"
import { createAgentWebMcpHandler } from "@zigil/agent-gonk"
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import type { ScopeAuthorizationPolicy } from "@workspace/agent-contracts/scope-authorization"

import {
  authenticateExternalScopeDelegation,
  authenticateEveTurnDelegation,
  authorizeSigilMcpRequest,
  createContainerScopeAuthorizationPolicy,
  resolveDelegatedAgentReach,
  type SessionExecutionBindingLookup,
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
import { MirkEveSessionOwnerStore } from "../../agent/agent/lib/eve-session-owners.js"
import type { ScopeGrantRegistry } from "../../agent/agent/lib/scope-grant-registry.js"
import { createSigilRegistry } from "./registry.js"
import type { ContainerRegistries } from "./registry/containers.js"

export function createSigilMcpHandler({
  apiKey,
  port,
  portlessUrl = process.env.PORTLESS_URL,
  configuredAllowedHosts = process.env.GONK_ALLOWED_HOSTS,
  containers,
  executionBindings,
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
  executionBindings?: SessionExecutionBindingLookup
  sessionOwners?: SessionScopeOwnerLookup
  scopeAuthorization?: ScopeAuthorizationPolicy
  /** Test/composition seam; production uses the complete Sigil registry. */
  source?: ToolRegistry
}) {
  const resolvedContainers = containers ?? createSigilRegistryContainers()
  const resolvedSessionOwners = sessionOwners ?? createSessionOwnerLookup()
  const resolvedExecutionBindings =
    executionBindings ?? new MirkEveSessionOwnerStore()
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
        resolvedSessionOwners.listOwned
          ? {
              listOwned: (principalId) =>
                resolvedSessionOwners.listOwned!(principalId),
            }
          : undefined,
        authorization,
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
      const authorizationHeader =
        request.headers.get("authorization") ?? undefined
      const serviceRequest = checkBearer(authorizationHeader, apiKey)
      const token = readBearer(authorizationHeader)
      const resourceScope = normalizeScopeHeaders(
        request.headers.get(SIGIL_SCOPE_HEADER) ?? undefined,
        request.headers.get(SIGIL_SESSION_SCOPE_HEADER) ?? undefined,
      )
      // The long-lived key alone authenticates only unscoped service work. A
      // scoped direct-API call also needs the web gateway's user/scope proof;
      // an Eve-hosted call instead carries its own fresh turn-bound bearer.
      const delegated = serviceRequest
        ? authenticateExternalScopeDelegation({
            policy: authorization,
            proof:
              request.headers.get(AGENT_SCOPE_PROOF_HEADER) ?? undefined,
            scope: resourceScope,
            secret: apiKey,
          })
        : await authenticateEveTurnDelegation({
            bindings: resolvedExecutionBindings,
            policy: authorization,
            scope: resourceScope,
            secret: apiKey,
            token,
          })
      if (resourceScope && !delegated) return null
      if (!serviceRequest && !delegated) return null
      const agentReach = delegated?.actorSessionId
        ? await resolveDelegatedAgentReach({
            actorSessionId: delegated.actorSessionId,
            bindings: resolvedExecutionBindings,
            principalId: delegated.principalId,
          })
        : undefined
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
                  method: delegated.actorSessionId
                    ? "custom:eve-turn-delegation"
                    : "custom:external-scope-delegation",
                },
                ...(delegated.actorSessionId
                  ? {
                      delegation: {
                        actorKind: "agent" as const,
                        actor: {
                          issuer: "sigil-chat",
                          subject: "sigil-chat-agent",
                          method: "service-token" as const,
                        },
                        actorId: "agent:sigil-chat-agent",
                        actorSessionId: delegated.actorSessionId,
                        metadata: {
                          channelId: delegated.channelId,
                          correlationId: delegated.correlationId,
                          delegationId: delegated.delegationId,
                          personaId: delegated.personaId,
                        },
                      },
                    }
                  : {}),
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
          ...(agentReach ? { sigilAgentReach: agentReach } : {}),
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
      const agentReach = extra.authInfo?.extra?.sigilAgentReach
      return {
        host:
          resourceScope !== undefined
            ? {
                resourceScope,
                ...(agentReach === "principal" || agentReach === "scope"
                  ? { agentReach }
                  : {}),
              }
            : typeof legacySessionScope === "string"
              ? {
                  sessionScope: legacySessionScope,
                  ...(agentReach === "principal" || agentReach === "scope"
                    ? { agentReach }
                    : {}),
                }
              : undefined,
      }
    },
    authorize: authorizeSigilMcpRequest,
    enableDnsRebindingProtection: true,
    enableJsonResponse: true,
    writeToolPolicy: "permissive",
  })
}

function readBearer(authorization: string | undefined): string | undefined {
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

function createSessionOwnerLookup(): SessionScopeOwnerLookup {
  let store: MirkAgentThreadScopeOwnerRegistry | undefined
  const registry = () => (store ??= new MirkAgentThreadScopeOwnerRegistry())
  return {
    owns(sessionId, principalId) {
      // Tests and container-only callers do not pay to open the Mirk backend;
      // a session proof is the only path that needs the durable owner record.
      return registry().owns(sessionId, principalId)
    },
    homeScopeId(sessionId, principalId) {
      return registry().homeScopeId(sessionId, principalId)
    },
    listOwned(principalId) {
      return registry().listOwned(principalId)
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
