import { blackboardRepository } from "@workspace/blackboard-store"
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
import { AGENT_SCOPE_PROOF_HEADER } from "@workspace/agent-contracts/scope-delegation"
import { MirkEveSessionOwnerStore } from "../lib/eve-session-owners"
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
  bindScopeDelegationToActorSession,
  canReadMemorySource,
  createScopeGrantPolicy,
  requireAuthorizedResourceScope,
} from "../lib/scope-authorization"
import { createReadinessRoute } from "../lib/readiness"

const authEnvironment = readSigilEveAuthEnvironment()
const authenticatePrincipal = createSigilRequestAuthenticator(authEnvironment)
const requiredSkillIds = readCsvEnv("SIGIL_CONTEXT_REQUIRED_SKILLS")
const pinnedResourceKeys = readCsvEnv("SIGIL_CONTEXT_PINNED_RESOURCE_KEYS")
const contextCompiler = createDefaultSigilContextCompiler({ requiredSkillIds })
const eveSessionOwnerStore = new MirkEveSessionOwnerStore()
const memorySourcePolicy = createScopeGrantPolicy()
const compileMessage = createSigilEveOnMessage({
  compiler: contextCompiler,
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
})
const onMessage: typeof compileMessage = async (context, message) => {
  const result = await compileMessage(context, message)
  if (!result?.auth || !context.eve.sessionId) return result
  const resourceScope = result.auth.attributes.sigilResourceScope
  const scopeProof = result.auth.attributes.sigilScopeProof
  const delegatedProof = bindScopeDelegationToActorSession({
    actorSessionId: context.eve.sessionId,
    principalId: result.auth.principalId,
    proof: typeof scopeProof === "string" ? scopeProof : undefined,
    resourceScope:
      typeof resourceScope === "string" ? resourceScope : undefined,
    secret: process.env.GONK_MCP_KEY,
  })
  if (!delegatedProof) return result
  return {
    ...result,
    auth: {
      ...result.auth,
      attributes: {
        ...result.auth.attributes,
        sigilScopeProof: delegatedProof,
      },
    },
  }
}

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
    const scopeProof = request.headers.get(AGENT_SCOPE_PROOF_HEADER)?.trim()
    try {
      resourceScope = requireAuthorizedResourceScope({
        principalId: auth.principalId,
        request,
        secret: process.env.GONK_MCP_KEY,
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
        process.env.GONK_MCP_KEY,
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
                homeScopeId: sessionBinding.homeScopeId,
                initialPerspective: sessionBinding.initialPerspective,
                additionalContextScopeIds:
                  sessionBinding.additionalContextScopeIds,
              }),
              ...(sessionBinding.eveSessionId
                ? { sigilAttestedEveSessionId: sessionBinding.eveSessionId }
                : {}),
            }
          : {}),
        ...(resourceScope
          ? {
              sigilResourceScope: resourceScope,
              // The browser never chooses this value: Eve just verified the
              // HMAC against the authenticated principal above. Preserve it
              // so Gonk can derive that same principal rather than reverting
              // to the shared service identity.
              ...(scopeProof ? { sigilScopeProof: scopeProof } : {}),
              // Preserve the old attribute for hosts that still inspect it.
              sigilSessionScope: resourceScope,
            }
          : {}),
      },
    }
  },
  onMessage,
  defaultPersonaId: DEFAULT_PERSONA_ID,
  ownerStore: eveSessionOwnerStore,
})

export default {
  ...channel,
  routes: [...channel.routes, createReadinessRoute(authenticatePrincipal)],
}

function readCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}
