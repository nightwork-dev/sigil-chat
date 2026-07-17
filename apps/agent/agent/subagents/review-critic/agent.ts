import { defineAgent } from "eve"
import { experimental_chatgpt } from "eve/models/openai"

export default defineAgent({
  description:
    "Independently critique a review passage or proposed edit for ambiguity, unsupported claims, operational gaps, and regressions. Use when a second reading would improve a document decision.",
  model: experimental_chatgpt(process.env.CODEX_MODEL),
  modelContextWindowTokens: 64_000,
})
