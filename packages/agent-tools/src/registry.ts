import { ToolRegistry } from "@gonk/tool-registry"

import { sigilApprovalProvider } from "./approval.js"
import { registerFeatureRequestTools } from "./feature-request.js"
import { registerRequestTools } from "./request.js"
import { registerSpecTools } from "./spec.js"
import { registerStoryTools } from "./story.js"
import type { SigilAgentToolDependencies } from "./types.js"

export function createSigilAgentToolRegistry(
  dependencies: SigilAgentToolDependencies,
): ToolRegistry {
  const registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  })

  registerStoryTools(registry, dependencies.workItems)
  registerFeatureRequestTools(registry, dependencies.workItems)
  registerRequestTools(registry, dependencies.workItems)
  if (dependencies.specs) registerSpecTools(registry, dependencies.specs)

  return registry
}
