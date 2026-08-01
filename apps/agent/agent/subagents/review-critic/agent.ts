import { defineAgent, defineDynamic } from "eve"
import { loadSigilConfigFixture } from "@workspace/runtime-env/config"
import { resolveSigilAgentModel } from "../../lib/model-provider"
import {
  readResolveContextAttributes,
  resolveSessionModelFromAuth,
} from "../../lib/session-model"

const { value: sigilConfig } = await loadSigilConfigFixture()
const sigilModel = resolveSigilAgentModel(sigilConfig.agent.model)

const CRITIC_CONTEXT_WINDOW_CAP = 64_000

export default defineAgent({
  description:
    "Independently critique a review passage or proposed edit for ambiguity, unsupported claims, operational gaps, and regressions. Use when a second reading would improve a document decision.",
  // A delegated critic inherits the delegating session's model: the subagent
  // session carries the same verified binding attributes, so a conversation
  // running as luna gets its second reading from luna rather than silently
  // falling back to the deployment default. The context-window cap is applied
  // to whichever model resolves, not just the fallback.
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
              modelContextWindowTokens: Math.min(
                selection.modelContextWindowTokens,
                CRITIC_CONTEXT_WINDOW_CAP,
              ),
            }
          : null
      },
    },
  }),
  modelContextWindowTokens: Math.min(
    sigilModel.contextWindowTokens,
    CRITIC_CONTEXT_WINDOW_CAP,
  ),
})
