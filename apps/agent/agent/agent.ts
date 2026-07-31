import { defineAgent } from "eve"
import { loadSigilConfigFixture } from "@workspace/runtime-env/config"
import { resolveSigilAgentModel } from "./lib/model-provider"

const { value: sigilConfig } = await loadSigilConfigFixture()
const sigilModel = resolveSigilAgentModel(sigilConfig.agent.model)

// Attachments are inlined by @zigil/agent/react/eve in the browser before send
// through toEveSendMessage. A host-side model middleware CANNOT do this: the AI
// SDK's message pipeline downloads (and SSRF-rejects) local URL file parts
// upstream of any model call, so inlining has to happen before the message
// enters that pipeline.
export default defineAgent({
  model: sigilModel.model,
  modelContextWindowTokens: sigilModel.contextWindowTokens,
  build: {
    externalDependencies: ["better-sqlite3"],
  },
})
