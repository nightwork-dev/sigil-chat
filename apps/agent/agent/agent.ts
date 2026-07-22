import { defineAgent } from "eve"
import { experimental_chatgpt } from "eve/models/openai"
import { readAgentEnvironment } from "@workspace/runtime-env/server"

const { model } = readAgentEnvironment(process.env)

// Attachments are inlined by the web app's Eve client before send. A host-side
// model middleware CANNOT do this: the AI
// SDK's message pipeline downloads (and SSRF-rejects) local URL file parts
// upstream of any model call, so inlining has to happen before the message
// enters that pipeline.
export default defineAgent({
  model: experimental_chatgpt(model),
  modelContextWindowTokens: 200_000,
  build: {
    externalDependencies: ["better-sqlite3"],
  },
})
