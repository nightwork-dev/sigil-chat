import { defineAgent } from "eve"
import { experimental_chatgpt } from "eve/models/openai"
import { readAgentEnvironment } from "@workspace/runtime-env/server"

const { model } = readAgentEnvironment(process.env)

export default defineAgent({
  description:
    "Independently critique a review passage or proposed edit for ambiguity, unsupported claims, operational gaps, and regressions. Use when a second reading would improve a document decision.",
  model: experimental_chatgpt(model),
  modelContextWindowTokens: 64_000,
})
