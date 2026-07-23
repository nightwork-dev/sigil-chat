import { defineAgent } from "eve"
import { experimental_chatgpt } from "eve/models/openai"
import { loadSigilConfigFixture } from "@workspace/runtime-env/config"

const { value: sigilConfig } = await loadSigilConfigFixture()

export default defineAgent({
  description:
    "Independently critique a review passage or proposed edit for ambiguity, unsupported claims, operational gaps, and regressions. Use when a second reading would improve a document decision.",
  model: experimental_chatgpt(sigilConfig.agent.model),
  modelContextWindowTokens: 64_000,
})
