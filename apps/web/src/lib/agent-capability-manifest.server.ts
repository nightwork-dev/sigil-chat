import {
  buildCapabilityManifest,
  principalCanMutateScope,
  type CapabilityManifest,
} from "@workspace/agent-contracts/capability-manifest"

import type { SigilAuthSession } from "./auth/server"
import { AuthenticationRequiredError } from "./auth/session"

// The web-side reconstruction of the capability manifest. Every field is
// derived from the verified session and the thread's signed execution binding —
// this function accepts only a session and a thread id, so there is no channel
// through which a browser could widen its own identity, scope, or tools. The
// pure assembly lives in `@workspace/agent-contracts/capability-manifest`; the
// same builder runs inside Eve, so the UI and the agent tell one story.

export interface CapabilityManifestBinding {
  personaId: string
  applicationThreadId: string
  /** The scope the session focuses on — the manifest's active resource scope. */
  focusScopeId: string
  additionalContextScopeIds: string[]
}

export interface CapabilityManifestSources {
  /** Resolves the immutable, server-verified binding for an owned thread. */
  resolveBinding: (
    principalId: string,
    threadId: string,
  ) => CapabilityManifestBinding
  /** Whether the active scope authorizes mutating tools for this principal. */
  canMutate: (principalId: string, focusScopeId: string) => boolean
  /** Loads the answering host and its live application-tool inventory. */
  loadHostAndTools: () => Promise<{
    host: { id: string; label: string; model?: string }
    tools: { name: string; description?: string }[]
  }>
  now?: () => number
}

export async function buildCapabilityManifestForSession(
  session: SigilAuthSession | null,
  threadId: string,
  sources: CapabilityManifestSources,
): Promise<CapabilityManifest> {
  if (!session) throw new AuthenticationRequiredError()
  const principalId = session.user.id
  const normalizedThreadId = threadId.trim()
  if (!normalizedThreadId) throw new Error("Agent thread id is required.")

  const binding = sources.resolveBinding(principalId, normalizedThreadId)
  const { host, tools } = await sources.loadHostAndTools()

  return buildCapabilityManifest({
    host,
    identity: {
      principalId,
      personaId: binding.personaId,
      applicationThreadId: binding.applicationThreadId,
    },
    activeScope: binding.focusScopeId,
    readableContextScopes: binding.additionalContextScopeIds,
    tools,
    mutationsAllowed: sources.canMutate(principalId, binding.focusScopeId),
    continuity: {
      // A bound thread always persists its transcript, exposes a session
      // blackboard, and can recall audience-filtered durable memory.
      conversationPersists: true,
      durableMemory: true,
      sharedBlackboard: true,
    },
    issuedAt: (sources.now ?? defaultNow)(),
  })
}

function defaultNow(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Production wiring for the reconstruction sources. Kept out of the pure
 * boundary above so tests can drive it with fakes and never touch the network,
 * the registries, or the clock.
 */
export async function createProductionCapabilityManifestSources(): Promise<CapabilityManifestSources> {
  const { resolveAgentThreadExecutionBinding } = await import(
    "./agent-threads.server"
  )
  const { getProjectWorkspaceRegistries } = await import(
    "../../../agent/agent/lib/project-workspace-registries"
  )
  const { createScopeGrantPolicy } = await import(
    "../../../agent/agent/lib/scope-authorization"
  )
  const { personalScopeId } = await import(
    "../../../agent/agent/lib/personal-scope"
  )
  const { joinRuntimeUrl, readRuntimeTopology } = await import(
    "@workspace/runtime-env/topology"
  )
  const { getEveBearerToken } = await import("./auth/session")
  const { fetchAgentRuntimeCatalogFromHost, fetchApplicationToolCatalog } =
    await import("./agent-catalog")

  const registries = getProjectWorkspaceRegistries()
  const policy = createScopeGrantPolicy({ registries })

  return {
    resolveBinding(principalId, threadId) {
      // threadId is browser-supplied, but resolveExecution re-authorizes every
      // scope it returns against THIS caller: assertBindingAuthorized rejects a
      // binding authored by another principal and asserts read access to the
      // focus scope and each additional context scope. So the displayed "what
      // you can see" scopes are already gated — the panel cannot over-report a
      // scope the caller isn't granted, even under the current deployment-global
      // thread ownership (tracked as the per-user-thread-ownership follow-up).
      const binding = resolveAgentThreadExecutionBinding(principalId, threadId)
      return {
        personaId: binding.personaId,
        applicationThreadId: binding.threadId,
        focusScopeId: binding.initialPerspective.focusScopeId,
        additionalContextScopeIds: binding.additionalContextScopeIds,
      }
    },
    canMutate(principalId, focusScopeId) {
      return principalCanMutateScope({
        principalId,
        scopeId: focusScopeId,
        registries: {
          scopes: registries.scopes,
          personalScopes: registries.personalScopes,
        },
        policy,
        personalScopeId,
      })
    },
    async loadHostAndTools() {
      const origin = readRuntimeTopology(process.env).eveOrigin
      const bearer = await getEveBearerToken()
      const [catalog, tools] = await Promise.all([
        fetchAgentRuntimeCatalogFromHost(
          joinRuntimeUrl(origin, "/eve/v1/info"),
          bearer,
        ),
        fetchApplicationToolCatalog(
          joinRuntimeUrl(origin, "/sigil/v1/application-tools"),
          bearer,
        ),
      ])
      return {
        host: {
          id: "eve",
          label: catalog.agent.name || "Eve",
          ...(catalog.agent.model ? { model: catalog.agent.model } : {}),
        },
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      }
    },
  }
}

