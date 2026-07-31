import { blackboardRepository } from "@workspace/blackboard-store"
import { createScope } from "@gonk/scope"
import { createStoreProvider } from "@gonk/store"
import { mirkBackendFactory } from "@gonk/store/sqlite"
import { MirkAgentContextReceiptRepository } from "@workspace/agent-tools/context-receipts"
import {
  createDefaultSigilContextCompiler,
  createSigilEveOnMessage,
} from "../lib/sigil-context"
import {
  createOwnedEveChannel,
  createSigilRequestAuthenticator,
  readSigilEveAuthEnvironment,
} from "../lib/eve-auth"
import { ForbiddenError } from "eve/channels/auth"
import { readOptionalSecretFromFile } from "@workspace/runtime-env/server"
import {
  agentToolRegistry,
  eveSessionOwnerStore,
} from "../lib/application-services"
import { createApplicationToolCatalogRoute } from "../lib/application-tool-catalog"
import {
  EveSessionBindingVerificationError,
  requireVerifiedEveSessionBinding,
} from "../lib/eve-session-binding"
import {
  automaticScopedMemoryRecallForTurn,
  DEFAULT_PERSONA_ID,
  hasPersona,
  memoryTurn,
  personaHost,
} from "../lib/memory"
import { parseToolApprovalPreference } from "../lib/tool-approval-preference"
import {
  canReadMemorySource,
  createScopeGrantPolicy,
  requireAuthorizedResourceScope,
} from "../lib/scope-authorization"
import { createReadinessRoute } from "../lib/readiness"
import { hasConfiguredModelCredential } from "../lib/model-provider"
import { hasCodexModelAuth } from "../lib/model-auth.mjs"
import {
  createRealtimeVoiceRoutes,
  RealtimeVoiceHost,
} from "../lib/realtime-voice"
import { loadSigilConfigFixture } from "@workspace/runtime-env/config"

const { value: sigilConfig } = await loadSigilConfigFixture()
const authEnvironment = readSigilEveAuthEnvironment()
const bindingSecret = readOptionalSecretFromFile(
  process.env,
  "SIGIL_AGENT_BINDING_SECRET",
)
const authenticatePrincipal = createSigilRequestAuthenticator(authEnvironment)
const requiredSkillIds = readCsvEnv("SIGIL_CONTEXT_REQUIRED_SKILLS")
const pinnedResourceKeys = readCsvEnv("SIGIL_CONTEXT_PINNED_RESOURCE_KEYS")
const memorySourcePolicy = createScopeGrantPolicy()
const scope = createScope({ cwd: process.cwd() })
const store = createStoreProvider(scope, {
  backendFactory: mirkBackendFactory(scope),
})
const contextReceiptRepository = new MirkAgentContextReceiptRepository({
  kv: store.kv("project", "sigil-chat.context-receipts.v1"),
})
const compileMessage = createSigilEveOnMessage({
  createCompiler: ({ binding }) =>
    createDefaultSigilContextCompiler({ binding, requiredSkillIds }),
  pinnedResourceKeys,
  authorizeMemorySource: ({ principalId, source }) =>
    canReadMemorySource({
      principalId,
      source,
      policy: memorySourcePolicy,
    }),
  // S3.2: the session's shared blackboard rides every turn.
  readBlackboard: async (sessionId) =>
    (await blackboardRepository.read(sessionId)).content,
  identityFloor: ({ eveSessionId, personaId, principalId }) =>
    personaHost(personaId).identityAtSessionStart(
      memoryTurn(eveSessionId, principalId),
    ).markdown,
  recallLatestTurn: ({ eveSessionId, personaId, principalId, query }) =>
    automaticScopedMemoryRecallForTurn({
      personaId,
      turn: memoryTurn(eveSessionId, principalId),
      query,
    }),
  recordContextReceipt: ({
    applicationThreadId,
    principalId,
    personaId,
    receipt,
  }) => {
    if (!applicationThreadId) return
    contextReceiptRepository.append({
      applicationThreadId,
      principalId,
      ...(personaId ? { personaId } : {}),
      receipt,
    })
  },
})
const realtimeVoiceHost = new RealtimeVoiceHost()
const channel = createOwnedEveChannel({
  auth: async (request) => {
    const auth = await authenticatePrincipal(request)
    if (!auth) return auth
    // Keep this raw header name in sync with the Sigil Chat approval client.
    // This is a client-declared UI preference;
    // it is not verified and is not a security boundary.
    const rawToolApproval = request.headers.get("x-sigil-tool-approval")
    const toolApproval = parseToolApprovalPreference(rawToolApproval)
    let resourceScope: string | undefined
    try {
      resourceScope = requireAuthorizedResourceScope({
        principalId: auth.principalId,
        request,
        secret: bindingSecret,
      })
    } catch {
      throw new ForbiddenError({
        code: "eve_resource_scope_not_authorized",
        message: "The requested resource scope is not authorized.",
      })
    }
    const requestedPersonaId =
      request.headers.get("x-sigil-persona-id")?.trim() || undefined
    let sessionBinding
    try {
      sessionBinding = requireVerifiedEveSessionBinding(
        request,
        auth.principalId,
        bindingSecret,
      )
    } catch (error) {
      if (!(error instanceof EveSessionBindingVerificationError)) throw error
      throw new ForbiddenError({
        code: "eve_session_binding_invalid",
        message: error.message,
      })
    }
    const boundPersonaId = sessionBinding?.personaId
    if (
      requestedPersonaId &&
      boundPersonaId &&
      requestedPersonaId !== boundPersonaId
    ) {
      throw new ForbiddenError({
        code: "eve_session_persona_mismatch",
        message: "The requested persona does not match the session binding.",
      })
    }
    const personaId = requestedPersonaId ?? boundPersonaId
    if (personaId && !hasPersona(personaId)) {
      throw new ForbiddenError({
        code: "eve_persona_not_found",
        message: "The requested persona is not available.",
      })
    }
    return {
      ...auth,
      attributes: {
        ...auth.attributes,
        sigilToolApproval: JSON.stringify(toolApproval),
        ...(personaId ? { sigilRequestedPersonaId: personaId } : {}),
        ...(sessionBinding
          ? {
              sigilExecutionBinding: JSON.stringify({
                applicationThreadId: sessionBinding.applicationThreadId,
                personaId: sessionBinding.personaId,
                ...(sessionBinding.channel
                  ? { channel: sessionBinding.channel }
                  : {}),
                homeScopeId: sessionBinding.homeScopeId,
                initialPerspective: sessionBinding.initialPerspective,
                additionalContextScopeIds:
                  sessionBinding.additionalContextScopeIds,
              }),
              ...(sessionBinding.runtimeSessionId
                ? {
                    sigilAttestedEveSessionId:
                      sessionBinding.runtimeSessionId,
                  }
                : {}),
            }
          : {}),
        ...(resourceScope
          ? {
              sigilResourceScope: resourceScope,
            }
          : {}),
      },
    }
  },
  onMessage: compileMessage,
  defaultPersonaId: DEFAULT_PERSONA_ID,
  ownerStore: eveSessionOwnerStore,
})

export default {
  ...channel,
  routes: [
    ...channel.routes,
    createApplicationToolCatalogRoute(authenticatePrincipal, agentToolRegistry),
    createReadinessRoute(authenticatePrincipal, {
      applicationToolCount: () => agentToolRegistry.list().length,
      hasModelAuth: () =>
        hasConfiguredModelCredential(sigilConfig.agent.model, {
          hasCodexModelAuth,
        }),
    }),
    // Live voice relays only SDP: the browser's offer in, Codex's answer out.
    // One host, one live session — the host object holds that lifecycle, keyed
    // by the application thread the call is bound to. The binding secret is
    // what lets it verify that binding rather than take the browser's word.
    ...createRealtimeVoiceRoutes(authenticatePrincipal, realtimeVoiceHost, {
      bindingSecret,
    }),
  ],
}

function readCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}
