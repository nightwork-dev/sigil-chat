import { defineAgent } from "eve"
import { loadSigilConfigFixture } from "@workspace/runtime-env/config"
import { resolveSigilAgentModel } from "../../lib/model-provider"

const { value: sigilConfig } = await loadSigilConfigFixture()
const sigilModel = resolveSigilAgentModel(sigilConfig.agent.model)

export default defineAgent({
  description:
    "Independently critique a review passage or proposed edit for ambiguity, unsupported claims, operational gaps, and regressions. Use when a second reading would improve a document decision.",
  model: sigilModel.model,
  modelContextWindowTokens: Math.min(sigilModel.contextWindowTokens, 64_000),
})
