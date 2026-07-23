import { ToolRegistry } from "@gonk/tool-registry"
import type { SessionArtifactStore } from "@workspace/artifact-store/repository"
import type { GraphRepository } from "@workspace/graph-store/repository"
import type { ReviewRepository } from "@workspace/review-store"
import type { SpecsRepository } from "@workspace/work-items-store/specs"
import type { WorkItemsRepository } from "@workspace/work-items-store/repository"

import { sigilApprovalProvider } from "./approval.js"
import { registerAnnotationTools } from "./annotations.js"
import { registerBlackboardTools } from "./blackboard.js"
import {
  registerContainerTools,
  type ContainerRegistries,
} from "./containers.js"
import { registerDemoSeedTools } from "./demo-seed.js"
import { registerDistillTools } from "./distill.js"
import { registerEvidenceTools } from "./evidence.js"
import { registerFeatureRequestTools } from "./feature-request.js"
import {
  registerFileTools,
  type ResourceUniverseRegistries,
} from "./files.js"
import { registerGraphTools } from "./graph.js"
import { registerImageTools } from "./image.js"
import { registerRequestTools } from "./request.js"
import { registerReviewTools } from "./review.js"
import {
  registerRuntimeTools,
  registerUiCommandTools,
} from "./runtime.js"
import { createSkillRegistry, registerSkillTools } from "./skills.js"
import { registerSpecTools } from "./spec.js"
import { registerStoryTools } from "./story.js"

export interface SigilAgentToolDependencies {
  artifacts: SessionArtifactStore
  containers: ContainerRegistries
  graph: GraphRepository
  reviews: ReviewRepository
  workItems: WorkItemsRepository
  specs?: SpecsRepository
  sessions?: ResourceUniverseRegistries["sessions"]
  skills?: ReturnType<typeof createSkillRegistry>
}

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
  registerContainerTools(registry, dependencies.containers)
  registerAnnotationTools(registry)
  registerGraphTools(registry, dependencies.graph)
  registerReviewTools(registry, dependencies.reviews)
  registerSkillTools(
    registry,
    dependencies.skills ?? createSkillRegistry(),
  )
  registerRuntimeTools(registry)
  registerUiCommandTools(registry)
  registerImageTools(
    registry,
    dependencies.artifacts,
    undefined,
    process.env.SIGIL_LOCAL_CODEX_IMAGE_GENERATION === "disabled"
      ? null
      : undefined,
  )
  registerFileTools(registry, dependencies.artifacts, {
    ...dependencies.containers,
    ...(dependencies.sessions ? { sessions: dependencies.sessions } : {}),
  })
  registerEvidenceTools(registry, dependencies.artifacts)
  registerDistillTools(registry, dependencies.artifacts)
  registerDemoSeedTools(registry, dependencies.artifacts)
  registerBlackboardTools(registry)

  return registry
}
