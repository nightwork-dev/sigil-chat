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
import { MirkEveSessionOwnerStore } from "../lib/eve-session-owners"
import { memoryTurn, sigilMemoryHost } from "../lib/memory"

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
  identityFloor: ({ eveSessionId, principalId }) =>
    sigilMemoryHost.identityAtSessionStart(memoryTurn(eveSessionId, principalId)).markdown,
})

export default createOwnedEveChannel({
  auth: async (request) => {
    const auth = await authenticatePrincipal(request)
    if (!auth) return auth
    // Keep this raw header name in sync with the Sigil Chat approval client.
    // This is a client-declared UI preference;
    // it is not verified and is not a security boundary.
    const toolApproval =
      request.headers.get("x-sigil-tool-approval") === "always"
        ? "always"
        : "ask"
    const resourceScope =
      request.headers.get("x-sigil-scope")?.trim() ??
      request.headers.get("x-sigil-session-id")?.trim()
    return {
      ...auth,
      attributes: {
        ...auth.attributes,
        sigilToolApproval: toolApproval,
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
  ownerStore: eveSessionOwnerStore,
})

function readCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}
