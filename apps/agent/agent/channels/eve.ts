import { localDev } from "eve/channels/auth"
import { eveChannel } from "eve/channels/eve"
import {
  createDefaultSigilContextCompiler,
  createSigilEveOnMessage,
} from "../lib/sigil-context"

const authenticateLocal = localDev()
const requiredSkillIds = readCsvEnv("SIGIL_CONTEXT_REQUIRED_SKILLS")
const pinnedResourceKeys = readCsvEnv("SIGIL_CONTEXT_PINNED_RESOURCE_KEYS")
const contextCompiler = createDefaultSigilContextCompiler({ requiredSkillIds })
const onMessage = createSigilEveOnMessage({
  compiler: contextCompiler,
  pinnedResourceKeys,
})

export default eveChannel({
  auth: [
    async (request) => {
      const auth = await authenticateLocal(request)
      if (!auth) return auth
      // Keep this raw header name in sync with the Sigil Chat approval client.
      // This is a client-declared UI preference;
      // it is not verified and is not a security boundary.
      const toolApproval =
        request.headers.get("x-sigil-tool-approval") === "always"
          ? "always"
          : "ask"
      const sessionScope = request.headers.get("x-sigil-session-id")?.trim()
      return {
        ...auth,
        attributes: {
          ...auth.attributes,
          sigilToolApproval: toolApproval,
          ...(sessionScope ? { sigilSessionScope: sessionScope } : {}),
        },
      }
    },
  ],
  onMessage,
})

function readCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}
