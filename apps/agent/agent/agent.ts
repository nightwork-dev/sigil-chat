import { defineAgent } from "eve"
import { experimental_chatgpt } from "eve/models/openai"

export default defineAgent({
  model: experimental_chatgpt(process.env.CODEX_MODEL ?? "gpt-5.6-terra"),
  modelContextWindowTokens: 200_000,
})
