import { defineAgent } from "eve"
import { experimental_chatgpt } from "eve/models/openai"
import { readAgentEnvironment } from "@workspace/runtime-env/server"

const { model } = readAgentEnvironment(process.env)

export default defineAgent({
  model: experimental_chatgpt(model),
  modelContextWindowTokens: 200_000,
})
