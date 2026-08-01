import { defineAgent, defineDynamic } from "eve"
import { loadSigilConfigFixture } from "@workspace/runtime-env/config"
import { resolveSigilAgentModel } from "./lib/model-provider"
import {
  readResolveContextAttributes,
  resolveSessionModelFromAuth,
} from "./lib/session-model"

const { value: sigilConfig } = await loadSigilConfigFixture()
const sigilModel = resolveSigilAgentModel(sigilConfig.agent.model)

// Attachments are inlined by @zigil/agent/react/eve in the browser before send
// through toEveSendMessage. A host-side model middleware CANNOT do this: the AI
// SDK's message pipeline downloads (and SSRF-rejects) local URL file parts
// upstream of any model call, so inlining has to happen before the message
// enters that pipeline.
export default defineAgent({
  // One Eve process serves every session, so the model cannot be a startup
  // decision if two sessions are to run different providers at once. The
  // resolver reads the model from the session's VERIFIED binding attributes
  // (see lib/session-model.ts for the trust argument) and returns null —
  // meaning this compiled fallback — for any session that made no choice.
  // Resolving at session.started keeps the model stable for the session's
  // life, which is what keeps the prompt cache intact.
  model: defineDynamic({
    fallback: sigilModel.model,
    events: {
      "session.started": (_event, ctx) => {
        const selection = resolveSessionModelFromAuth(
          sigilConfig.agent,
          readResolveContextAttributes(ctx),
        )
        return selection
          ? {
              model: selection.model,
              modelContextWindowTokens: selection.modelContextWindowTokens,
            }
          : null
      },
    },
  }),
  modelContextWindowTokens: sigilModel.contextWindowTokens,
  build: {
    externalDependencies: ["better-sqlite3"],
  },
})
