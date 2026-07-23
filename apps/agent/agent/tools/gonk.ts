import { createGonkToolResolver } from "@gonk/eve-host/tools"

import { agentToolRegistry } from "../lib/application-services"
import {
  approvalForGonkTool,
  authorizeGonkToolDiscovery,
  makeGonkToolContext,
} from "../lib/gonk-tool-context"

export default createGonkToolResolver({
  registry: agentToolRegistry,
  authorizeDiscovery: authorizeGonkToolDiscovery,
  makeContext: makeGonkToolContext,
  approval: ({ tool, gonkApproval, dynamic }) =>
    approvalForGonkTool({
      tool,
      gonkApproval,
      dynamic,
    }),
})
