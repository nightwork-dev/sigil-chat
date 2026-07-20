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
import { MirkEveSessionOwnerStore } from "../lib/eve-session-owners"
import {
  DEFAULT_PERSONA_ID,
  hasPersona,
  memoryTurn,
  personaHost,
} from "../lib/memory"
import { parseToolApprovalPreference } from "../lib/tool-approval-preference"

const authEnvironment = readSigilEveAuthEnvironment()
const authenticatePrincipal = createSigilRequestAuthenticator(authEnvironment)
const requiredSkillIds = readCsvEnv("SIGIL_CONTEXT_REQUIRED_SKILLS")
const pinnedResourceKeys = readCsvEnv("SIGIL_CONTEXT_PINNED_RESOURCE_KEYS")
const contextCompiler = createDefaultSigilContextCompiler({ requiredSkillIds })
const eveSessionOwnerStore = new MirkEveSessionOwnerStore()
const onMessage = createSigilEveOnMessage({
  compiler: contextCompiler,
  pinnedResourceKeys,
  // S3.2: the session's shared blackboard rides every turn.
  readBlackboard: async (sessionId) =>
    (await blackboardRepository.read(sessionId)).content,
  identityFloor: ({ eveSessionId, personaId, principalId }) =>
    personaHost(personaId).identityAtSessionStart(
      memoryTurn(eveSessionId, principalId),
    ).markdown,
})

export default createOwnedEveChannel({
  auth: async (request) => {
    const auth = await authenticatePrincipal(request)
    if (!auth) return auth
    // Keep this raw header name in sync with the Sigil Chat approval client.
    // This is a client-declared UI preference;
    // it is not verified and is not a security boundary.
    const rawToolApproval = request.headers.get("x-sigil-tool-approval")
    const toolApproval = parseToolApprovalPreference(rawToolApproval)
    const resourceScope =
      request.headers.get("x-sigil-scope")?.trim() ??
      request.headers.get("x-sigil-session-id")?.trim()
    const requestedPersonaId =
      request.headers.get("x-sigil-persona-id")?.trim() || undefined
    if (requestedPersonaId && !hasPersona(requestedPersonaId)) {
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
        ...(requestedPersonaId
          ? { sigilRequestedPersonaId: requestedPersonaId }
          : {}),
        ...(resourceScope
          ? {
              sigilResourceScope: resourceScope,
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

function readCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}
