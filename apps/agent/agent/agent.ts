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
  //
  // `step.started`, NOT `session.started`, and this is load-bearing rather
  // than a preference. Eve requires session- and turn-scoped selections to be
  // SERIALIZABLE — it durably records them as a model-id reference — so a
  // resolver that returns a provider object at those events is rejected with
  // a logged error and the selection is discarded (see eve's
  // dynamic-model-lifecycle: "session- and turn-scoped model selections must
  // be serializable. Return a model id string for this scope, or use
  // step.started"). Our providers are real AI SDK instances built from the
  // fixture — a codex or LM Studio model is not an AI Gateway id string — so
  // the object-valued path is the only correct one, and step scope is where
  // eve permits it. The guard test in agent-definition.test.ts pins this.
  //
  // Cost: the resolver runs per step rather than once per session. It is pure
  // fixture lookup plus provider construction, and the resulting model id and
  // parameters are identical every step, so the prompt cache is unaffected.
  model: defineDynamic({
    fallback: sigilModel.model,
    events: {
      "step.started": (_event, ctx) => {
        const selection = resolveSessionModelFromAuth(
          sigilConfig.agent,
          readResolveContextAttributes(ctx),
        )
        return selection
          ? {
              model: selection.model,
              modelContextWindowTokens: selection.modelContextWindowTokens,
              // MDL.4: reasoning level / fast mode, resolved fresh every step
              // alongside the model itself — see session-model.ts's
              // applyReasoningSelection for how this is clamped against the
              // preset's declaration.
              ...(selection.modelOptions
                ? { modelOptions: selection.modelOptions }
                : {}),
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
