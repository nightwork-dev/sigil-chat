import { ToolRegistry } from "@gonk/tool-registry";
import {
  graphRepository,
  type GraphRepository,
} from "@workspace/graph-store/repository";
import {
  reviewRepository,
  type ReviewRepository,
} from "@workspace/review-store";

import { sigilApprovalProvider } from "./registry/approval.js";
import { registerGraphTools } from "./registry/graph.js";
import {
  createReviewDemoRepository,
  registerReviewTools,
} from "./registry/review.js";
import {
  registerRuntimeTools,
  registerUiCommandTools,
} from "./registry/runtime.js";

export { sigilApprovalProvider } from "./registry/approval.js";
export { createReviewDemoRepository } from "./registry/review.js";

export function createSigilRegistry(
  repository: GraphRepository = graphRepository,
  reviews: ReviewRepository = reviewRepository,
): ToolRegistry {
  const registry = new ToolRegistry({
    security: { approvalProvider: sigilApprovalProvider },
  });

  registerRuntimeTools(registry);
  registerGraphTools(registry, repository);
  registerReviewTools(registry, reviews);
  registerUiCommandTools(registry);

  return registry;
}
