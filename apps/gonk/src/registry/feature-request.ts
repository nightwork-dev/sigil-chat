import { shape, type ToolRegistry } from "@gonk/tool-registry";
import type { WorkItemsRepository } from "@workspace/work-items-store/repository";
import type { FeatureRequestProposalInput } from "@workspace/work-items-store/types";

import { writeHints } from "./schemas.js";
import { hasOnlyKeys, isRecord } from "./validators.js";

const WORK_ITEMS_RESOURCE_KIND = "work-items-board";
const WORK_ITEMS_RESOURCE_ID = "work-items";
const WORK_ITEMS_OUTCOME_KIND = "work-items.changed";

type FeatureRequestToolInput = FeatureRequestProposalInput & {
  expectedRevision?: number;
};

type ScopeTarget = {
  tier: string;
  id: string;
  resourceScope: string;
};

export function registerFeatureRequestTools(
  registry: ToolRegistry,
  workItemsRepository: WorkItemsRepository,
): void {
  registry.register({
    name: "sigil-feature-request-propose",
    description:
      "Propose a durable product feature request from the current trusted principal and scope. Use only for durable product changes, defects, or capability requests; it creates idea-stage feature requests and blocks likely duplicates.",
    visibility: "always",
    approval: "write",
    input: shape<FeatureRequestToolInput>(
      isFeatureRequestToolInput,
      "Expected problem, desiredOutcome, optional evidence/sourceRefs/intendedScopeId/proposedSponsorPrincipalId, and optional integer expectedRevision. Provenance, actor, session, timestamps, status, priority, assignment, and approval are server-derived or unavailable here.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        problem: { type: "string", minLength: 1 },
        desiredOutcome: { type: "string", minLength: 1 },
        evidence: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
        sourceRefs: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
        intendedScopeId: { type: "string", minLength: 1 },
        proposedSponsorPrincipalId: { type: "string", minLength: 1 },
        expectedRevision: { type: "integer", minimum: 0 },
      },
      required: ["problem", "desiredOutcome"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input, context) => {
      const host = toHostContext(context.host);
      const target = resolveTargetScope(input.intendedScopeId, host);
      const actorPrincipalId = context.auth?.principal.id;
      if (!actorPrincipalId) {
        throw new Error(
          "Feature request proposals require a trusted authenticated principal.",
        );
      }
      const authorization = await context.auth?.authorize({
        action: "application:scope.tool",
        resource: {
          kind: "application:scope",
          target: target.resourceScope,
          scope: toAuthzScope(target.tier),
        },
      });
      if (authorization?.outcome === "deny") {
        throw new Error(
          `Principal ${actorPrincipalId} is not authorized for ${target.resourceScope}.`,
        );
      }
      const result = await workItemsRepository.proposeFeatureRequest(
        {
          problem: input.problem,
          desiredOutcome: input.desiredOutcome,
          ...(input.evidence ? { evidence: input.evidence } : {}),
          ...(input.sourceRefs ? { sourceRefs: input.sourceRefs } : {}),
          intendedScopeId: target.id,
          ...(input.proposedSponsorPrincipalId
            ? { proposedSponsorPrincipalId: input.proposedSponsorPrincipalId }
            : {}),
        },
        {
          actorPrincipalId,
          agentSessionId: resolveAgentSessionId(host),
          currentScopeId: target.id,
          now: new Date().toISOString(),
        },
        input.expectedRevision,
      );
      if (result.outcome === "duplicate") {
        return {
          data: {
            outcome: "duplicate",
            duplicateDecision: result.duplicateDecision,
            candidates: result.candidates,
            changedIds: [],
          },
        };
      }
      return {
        data: {
          outcome: "created",
          workItem: result.workItem,
          document: result.document,
          duplicateDecision: result.duplicateDecision,
          changedIds: result.changedIds,
          clientCommand: clientCommand(result, "feature-request.propose"),
        },
      };
    },
  });
}

function clientCommand(
  result: { document: { revision: number }; changedIds: string[] },
  operation: string,
) {
  return {
    type: "agent.domain.outcome" as const,
    payload: {
      id: `work-items:${operation}:${result.document.revision}:${result.changedIds.join(",") || "none"}`,
      kind: WORK_ITEMS_OUTCOME_KIND,
      resource: {
        kind: WORK_ITEMS_RESOURCE_KIND,
        id: WORK_ITEMS_RESOURCE_ID,
        revision: result.document.revision,
      },
      operation,
      changedIds: result.changedIds,
    },
  };
}

function isFeatureRequestToolInput(
  value: unknown,
): value is FeatureRequestToolInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "problem",
      "desiredOutcome",
      "evidence",
      "sourceRefs",
      "intendedScopeId",
      "proposedSponsorPrincipalId",
      "expectedRevision",
    ]) &&
    isNonEmptyString(value.problem) &&
    isNonEmptyString(value.desiredOutcome) &&
    isOptionalNonEmptyStringArray(value.evidence) &&
    isOptionalNonEmptyStringArray(value.sourceRefs) &&
    (value.intendedScopeId === undefined ||
      isNonEmptyString(value.intendedScopeId)) &&
    (value.proposedSponsorPrincipalId === undefined ||
      isNonEmptyString(value.proposedSponsorPrincipalId)) &&
    (value.expectedRevision === undefined ||
      Number.isInteger(value.expectedRevision))
  );
}

function toHostContext(
  host: unknown,
): { resourceScope?: unknown; sessionScope?: unknown } | undefined {
  return isRecord(host) ? host : undefined;
}

function toAuthzScope(
  tier: string,
):
  | "global"
  | "persona"
  | "project"
  | "directory"
  | "session"
  | "tenant"
  | "workspace"
  | "resource" {
  switch (tier) {
    case "persona":
    case "project":
    case "directory":
    case "session":
    case "tenant":
    case "workspace":
    case "resource":
      return tier;
    default:
      return "resource";
  }
}

function resolveTargetScope(
  intendedScopeId: string | undefined,
  host: { resourceScope?: unknown; sessionScope?: unknown } | undefined,
): ScopeTarget {
  const current =
    parseScope(host?.resourceScope) ?? parseSessionScope(host?.sessionScope);
  const intended = parseScope(intendedScopeId);
  if (intended) return intended;
  if (intendedScopeId && current) {
    return {
      tier: current.tier,
      id: intendedScopeId.trim(),
      resourceScope: `${current.tier}:${intendedScopeId.trim()}`,
    };
  }
  if (current) return current;
  throw new Error(
    "Feature request proposals require a trusted current resource or session scope.",
  );
}

function resolveAgentSessionId(
  host: { resourceScope?: unknown; sessionScope?: unknown } | undefined,
): string | undefined {
  const resourceScope = parseScope(host?.resourceScope);
  if (resourceScope?.tier === "session") return resourceScope.id;
  const sessionScope = parseSessionScope(host?.sessionScope);
  return sessionScope?.id;
}

function parseSessionScope(value: unknown): ScopeTarget | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? {
        tier: "session",
        id: value.trim(),
        resourceScope: `session:${value.trim()}`,
      }
    : undefined;
}

function parseScope(value: unknown): ScopeTarget | undefined {
  if (typeof value === "string") {
    const separator = value.indexOf(":");
    if (separator < 1 || separator === value.length - 1) return undefined;
    const tier = value.slice(0, separator);
    const id = value.slice(separator + 1);
    return { tier, id, resourceScope: value };
  }
  if (
    isRecord(value) &&
    typeof value.tier === "string" &&
    value.tier.length > 0 &&
    typeof value.id === "string" &&
    value.id.length > 0
  ) {
    return {
      tier: value.tier,
      id: value.id,
      resourceScope: `${value.tier}:${value.id}`,
    };
  }
  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonEmptyStringArray(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every((entry) => isNonEmptyString(entry)))
  );
}
