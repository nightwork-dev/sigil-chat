import { ToolRegistry } from "@gonk/tool-registry";
import { getProjectWorkspaceRegistries } from "../../agent/agent/lib/project-workspace-registries.js";
import {
  getSessionArtifactStore,
  type SessionArtifactStore,
} from "./artifact-store.js";
import {
  graphRepository,
  type GraphRepository,
} from "@workspace/graph-store/repository";
import {
  reviewRepository,
  type ReviewRepository,
} from "@workspace/review-store";
import {
  workItemsRepository,
  type WorkItemsRepository,
} from "@workspace/work-items-store";
import { specsRepository } from "@workspace/work-items-store/specs";

import { sigilApprovalProvider } from "./registry/approval.js";
import { registerBlackboardTools } from "./registry/blackboard.js";
import { registerGraphTools } from "./registry/graph.js";
import { registerImageTools } from "./registry/image.js";
import { registerFileTools } from "./registry/files.js";
import type { ResourceUniverseRegistries } from "./registry/files.js";
import { registerEvidenceTools } from "./registry/evidence.js";
import { registerDistillTools } from "./registry/distill.js";
import { registerDemoSeedTools } from "./registry/demo-seed.js";
import {
  createReviewDemoRepository,
  registerReviewTools,
} from "./registry/review.js";
import { registerStoryTools } from "./registry/story.js";
import { registerFeatureRequestTools } from "./registry/feature-request.js";
import { registerSpecTools } from "./registry/spec.js";
import {
  registerContainerTools,
  type ContainerRegistries,
} from "./registry/containers.js";
import { registerAnnotationTools } from "./registry/annotations.js";
import { createSkillRegistry, registerSkillTools } from "./registry/skills.js";
import {
  registerRuntimeTools,
  registerUiCommandTools,
} from "./registry/runtime.js";

export { sigilApprovalProvider } from "./registry/approval.js";
export { createReviewDemoRepository } from "./registry/review.js";

export function createSigilRegistry(
  repository: GraphRepository = graphRepository,
  reviews: ReviewRepository = reviewRepository,
  workItems: WorkItemsRepository = workItemsRepository,
  artifacts: SessionArtifactStore = getSessionArtifactStore(),
  skills = createSkillRegistry(),
  containers: ContainerRegistries = getProjectWorkspaceRegistries(),
  sessions?: ResourceUniverseRegistries["sessions"],
): ToolRegistry {
  const registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  });

  registerRuntimeTools(registry);
  registerGraphTools(registry, repository);
  registerReviewTools(registry, reviews);
  registerStoryTools(registry, workItems);
  registerFeatureRequestTools(registry, workItems);
  registerSpecTools(registry, specsRepository);
  registerContainerTools(registry, containers);
  registerAnnotationTools(registry);
  registerSkillTools(registry, skills);
  registerUiCommandTools(registry);
  registerImageTools(
    registry,
    artifacts,
    undefined,
    process.env.SIGIL_LOCAL_CODEX_IMAGE_GENERATION === "disabled"
      ? null
      : undefined,
  );
  registerFileTools(registry, artifacts, {
    ...containers,
    ...(sessions ? { sessions } : {}),
  });
  registerEvidenceTools(registry, artifacts);
  registerDistillTools(registry, artifacts);
  registerDemoSeedTools(registry, artifacts);
  registerBlackboardTools(registry);

  return registry;
}
