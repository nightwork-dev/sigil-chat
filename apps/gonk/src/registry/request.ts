import { shape, type ToolRegistry } from "@gonk/tool-registry";
import type { AuthContext, AuthenticatedPrincipal } from "@gonk/auth";
import type { WorkItemsRepository } from "@workspace/work-items-store/repository";
import type {
  AddRequestEvidenceInput,
  FeatureRequestProposalInput,
  RequestFilter,
} from "@workspace/work-items-store/types";

import { readHints, writeHints } from "./schemas.js";
import { hasOnlyKeys, isRecord } from "./validators.js";

const WORK_ITEMS_RESOURCE_KIND = "work-items-board";
const WORK_ITEMS_RESOURCE_ID = "work-items";
const WORK_ITEMS_OUTCOME_KIND = "work-items.changed";

type RequestSearchInput = {
  filter?: RequestFilter;
  expectedRevision?: number;
};
type RequestInspectInput = { id: string; expectedRevision?: number };
type RequestProposeInput = FeatureRequestProposalInput & {
  originMode?: "agent-proposal" | "principal-directed-agent" | "after-action";
};
type RequestAddEvidenceInput = AddRequestEvidenceInput;

const requestKinds = [
  "feature",
  "tool",
  "skill",
  "integration",
  "data-access",
  "defect",
  "workflow",
  "other",
] as const;
const requestStates = [
  "proposed",
  "awaiting-sponsor",
  "triage",
  "accepted",
  "declined",
  "duplicate",
  "promoted",
  "archived",
] as const;
const toolOriginModes = [
  "agent-proposal",
  "principal-directed-agent",
  "after-action",
] as const;

type ScopeTarget = {
  tier: string;
  id: string;
  resourceScope: string;
};

export function registerRequestTools(
  registry: ToolRegistry,
  workItemsRepository: WorkItemsRepository,
): void {
  registry.register({
    name: "sigil-request-search",
    description:
      "Search durable human and agent product requests before proposing a new one. Use this to find exact or likely matches and add evidence instead of duplicating.",
    visibility: "always",
    approval: "read",
    input: shape<RequestSearchInput>(
      isRequestSearchInput,
      "Expected optional request filters and optional integer expectedRevision.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        filter: requestFilterSchema(),
        expectedRevision: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
    hints: readHints,
    handler: async (input, context) => {
      const target = resolveTargetScope(undefined, toHostContext(context.host));
      await requireScopeAccess(context.auth, target);
      if (
        input.filter?.homeScopeId &&
        !matchesTargetScope(input.filter.homeScopeId, target)
      ) {
        const revision = (
          await workItemsRepository.searchRequests({ homeScopeId: target.id })
        ).revision;
        assertRevision(revision, input.expectedRevision);
        return { data: { revision, requests: [] } };
      }
      const result = await workItemsRepository.searchRequests({
        ...input.filter,
        homeScopeId: target.id,
      });
      assertRevision(result.revision, input.expectedRevision);
      return { data: result };
    },
  });

  registry.register({
    name: "sigil-request-inspect",
    description:
      "Inspect one durable request, including its structured request fields, evidence, sponsorship receipts, and promotion links.",
    visibility: "always",
    approval: "read",
    input: shape<RequestInspectInput>(
      isRequestInspectInput,
      "Expected a request id and optional integer expectedRevision.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        expectedRevision: { type: "integer", minimum: 0 },
      },
      required: ["id"],
      additionalProperties: false,
    },
    hints: readHints,
    handler: async (input, context) => {
      const target = resolveTargetScope(undefined, toHostContext(context.host));
      await requireScopeAccess(context.auth, target);
      const result = await opaqueRequestLookup(() =>
        workItemsRepository.inspectRequest(input.id),
      );
      if (result.request.homeScopeId !== target.id)
        throw new Error("Request was not found.");
      assertRevision(result.revision, input.expectedRevision);
      return { data: result };
    },
  });

  registry.register({
    name: "sigil-request-propose",
    description:
      "Propose a durable low-authority request for a feature, tool, skill, integration, data/access, defect, or workflow need. Search first; this blocks duplicates and cannot set sponsorship decisions, priority, assignment, acceptance, promotion, or delivery status.",
    visibility: "always",
    approval: "write",
    input: shape<RequestProposeInput>(
      isRequestProposeInput,
      "Expected requester-authored request content only: kind, title, problem, desiredOutcome, optional structured evidence/framing/scope/sourceRefs/sponsor proposal/originMode. Trusted provenance and workflow authority are unavailable here.",
    ),
    inputJsonSchema: requestProposalSchema(),
    hints: writeHints,
    handler: async (input, context) => {
      const host = toHostContext(context.host);
      const target = resolveTargetScope(input.intendedScopeId, host);
      const principal = await requireScopeWrite(context.auth, target);
      const result = await workItemsRepository.proposeFeatureRequest(
        {
          requestKind: input.requestKind,
          title: input.title,
          problem: input.problem,
          desiredOutcome: input.desiredOutcome,
          evidence: input.evidence,
          structuredEvidence: input.structuredEvidence,
          relatedScopeIds: input.relatedScopeIds,
          proposedApproach: input.proposedApproach,
          impact: input.impact,
          frequency: input.frequency,
          constraints: input.constraints,
          targetAudience: input.targetAudience,
          sourceRefs: input.sourceRefs,
          intendedScopeId: target.id,
          proposedSponsorPrincipalId: input.proposedSponsorPrincipalId,
        },
        {
          actorPrincipalId: principal.id,
          requesterId: principal.delegation?.actorId ?? principal.id,
          requesterKind: "agent",
          originMode: input.originMode ?? "agent-proposal",
          agentSessionId: resolveAgentSessionId(principal),
          currentScopeId: target.id,
          now: new Date().toISOString(),
        },
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
          clientCommand: clientCommand(result, "request.propose"),
        },
      };
    },
  });

  registry.register({
    name: "sigil-request-add-evidence",
    description:
      "Append structured evidence from a concrete task encounter to an existing durable request. Use this for duplicate or repeated needs instead of creating another request.",
    visibility: "always",
    approval: "write",
    input: shape<RequestAddEvidenceInput>(
      isRequestAddEvidenceInput,
      "Expected requestId plus structured evidence with constraint, workaround, cost, expectedImprovement, and optional proof/taskRef/sourceRefs.",
    ),
    inputJsonSchema: requestEvidenceSchema(),
    hints: writeHints,
    handler: async (input, context) => {
      const target = resolveTargetScope(undefined, toHostContext(context.host));
      const principal = await requireScopeWrite(context.auth, target);
      const inspect = await opaqueRequestLookup(() =>
        workItemsRepository.inspectRequest(input.requestId),
      );
      if (inspect.request.homeScopeId !== target.id)
        throw new Error("Request was not found.");
      const result = await workItemsRepository.addRequestEvidence(
        input,
        {
          actorPrincipalId: principal.id,
          requesterId: principal.delegation?.actorId ?? principal.id,
          requesterKind: "agent",
          originMode: "after-action",
          agentSessionId: resolveAgentSessionId(principal),
          currentScopeId: target.id,
          now: new Date().toISOString(),
        },
      );
      return {
        data: {
          ...result,
          clientCommand: clientCommand(result, "request.evidence.add"),
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

async function requireScopeWrite(
  auth: AuthContext | undefined,
  target: ScopeTarget,
): Promise<AuthenticatedPrincipal & { kind: "human" }> {
  return requireScopeAccess(auth, target);
}

async function requireScopeAccess(
  auth: AuthContext | undefined,
  target: ScopeTarget,
): Promise<AuthenticatedPrincipal & { kind: "human" }> {
  if (
    !auth?.principal ||
    auth.principal.kind !== "human" ||
    !auth.principal.delegation?.actorSessionId
  ) {
    throw new Error(
      "Request intake tools require a delegated authenticated human principal with a trusted actor session.",
    );
  }
  const authorization = await auth.authorize({
    action: "application:scope.tool",
    resource: {
      kind: "application:scope",
      target: target.resourceScope,
      scope: toAuthzScope(target.tier),
    },
  });
  if (authorization?.outcome !== "allow") {
    throw new Error(
      `Principal ${auth.principal.id} is not authorized for ${target.resourceScope}.`,
    );
  }
  return auth.principal as AuthenticatedPrincipal & { kind: "human" };
}

async function opaqueRequestLookup<T>(lookup: () => Promise<T>): Promise<T> {
  try {
    return await lookup();
  } catch {
    throw new Error("Request was not found.");
  }
}

function matchesTargetScope(value: string, target: ScopeTarget): boolean {
  const trimmed = value.trim();
  return trimmed === target.id || trimmed === target.resourceScope;
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
  if (!current)
    throw new Error(
      "Request intake tools require a trusted current resource or session scope.",
    );
  if (!intendedScopeId) return current;

  const trimmed = intendedScopeId.trim();
  const intended = parseScope(trimmed);
  if (intended && intended.resourceScope === current.resourceScope)
    return current;
  if (!intended && trimmed === current.id) return current;
  throw new Error(
    "Request intake tools cannot switch target scope from the authenticated request scope.",
  );
}

function resolveAgentSessionId(principal: AuthenticatedPrincipal): string {
  const actorSessionId = principal.delegation?.actorSessionId;
  if (!actorSessionId) {
    throw new Error(
      "Request intake tools require a trusted delegated actor session.",
    );
  }
  return actorSessionId;
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

function assertRevision(current: number, expected?: number): void {
  if (expected !== undefined && expected !== current)
    throw new Error(
      `Work-items revision conflict: expected ${expected}, current ${current}.`,
    );
}

function isRequestSearchInput(value: unknown): value is RequestSearchInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["filter", "expectedRevision"]) &&
    (value.filter === undefined || isRequestFilter(value.filter)) &&
    isOptionalInteger(value.expectedRevision)
  );
}

function isRequestFilter(value: unknown): value is RequestFilter {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "requestKind",
      "requestState",
      "homeScopeId",
      "sponsorPrincipalId",
      "requesterId",
      "query",
    ]) &&
    (value.requestKind === undefined ||
      requestKinds.includes(value.requestKind as never)) &&
    (value.requestState === undefined ||
      requestStates.includes(value.requestState as never)) &&
    isOptionalText(value.homeScopeId) &&
    isOptionalText(value.sponsorPrincipalId) &&
    isOptionalText(value.requesterId) &&
    isOptionalText(value.query)
  );
}

function isRequestInspectInput(value: unknown): value is RequestInspectInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "expectedRevision"]) &&
    isText(value.id) &&
    isOptionalInteger(value.expectedRevision)
  );
}

function isRequestProposeInput(value: unknown): value is RequestProposeInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "requestKind",
      "title",
      "problem",
      "desiredOutcome",
      "evidence",
      "structuredEvidence",
      "relatedScopeIds",
      "proposedApproach",
      "impact",
      "frequency",
      "constraints",
      "targetAudience",
      "sourceRefs",
      "intendedScopeId",
      "proposedSponsorPrincipalId",
      "originMode",
    ]) &&
    (value.requestKind === undefined ||
      requestKinds.includes(value.requestKind as never)) &&
    isText(value.title) &&
    isText(value.problem) &&
    isText(value.desiredOutcome) &&
    isOptionalTextArray(value.evidence) &&
    (value.structuredEvidence === undefined ||
      (Array.isArray(value.structuredEvidence) &&
        value.structuredEvidence.every(isEvidenceBody))) &&
    isOptionalTextArray(value.relatedScopeIds) &&
    isOptionalText(value.proposedApproach) &&
    isOptionalText(value.impact) &&
    isOptionalText(value.frequency) &&
    isOptionalText(value.constraints) &&
    isOptionalText(value.targetAudience) &&
    isOptionalTextArray(value.sourceRefs) &&
    isOptionalText(value.intendedScopeId) &&
    isOptionalText(value.proposedSponsorPrincipalId) &&
    (value.originMode === undefined ||
      toolOriginModes.includes(value.originMode as never))
  );
}

function isRequestAddEvidenceInput(
  value: unknown,
): value is RequestAddEvidenceInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["requestId", "evidence", "expectedRevision"]) &&
    isText(value.requestId) &&
    isEvidenceBody(value.evidence) &&
    isOptionalInteger(value.expectedRevision)
  );
}

function isEvidenceBody(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "constraint",
      "workaround",
      "cost",
      "expectedImprovement",
      "proof",
      "taskRef",
      "sourceRefs",
    ]) &&
    isText(value.constraint) &&
    isText(value.workaround) &&
    isText(value.cost) &&
    isText(value.expectedImprovement) &&
    isOptionalText(value.proof) &&
    isOptionalText(value.taskRef) &&
    isOptionalTextArray(value.sourceRefs)
  );
}

function requestFilterSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      requestKind: { type: "string", enum: [...requestKinds] },
      requestState: { type: "string", enum: [...requestStates] },
      homeScopeId: { type: "string", minLength: 1 },
      sponsorPrincipalId: { type: "string", minLength: 1 },
      requesterId: { type: "string", minLength: 1 },
      query: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  };
}

function requestProposalSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      requestKind: { type: "string", enum: [...requestKinds] },
      title: { type: "string", minLength: 1 },
      problem: { type: "string", minLength: 1 },
      desiredOutcome: { type: "string", minLength: 1 },
      evidence: textArraySchema(),
      structuredEvidence: {
        type: "array",
        minItems: 1,
        items: evidenceBodySchema(),
      },
      relatedScopeIds: textArraySchema(),
      proposedApproach: { type: "string", minLength: 1 },
      impact: { type: "string", minLength: 1 },
      frequency: { type: "string", minLength: 1 },
      constraints: { type: "string", minLength: 1 },
      targetAudience: { type: "string", minLength: 1 },
      sourceRefs: textArraySchema(),
      intendedScopeId: { type: "string", minLength: 1 },
      proposedSponsorPrincipalId: { type: "string", minLength: 1 },
      originMode: { type: "string", enum: [...toolOriginModes] },
    },
    required: ["title", "problem", "desiredOutcome"],
    additionalProperties: false,
  };
}

function requestEvidenceSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      requestId: { type: "string", minLength: 1 },
      evidence: evidenceBodySchema(),
      expectedRevision: { type: "integer", minimum: 0 },
    },
    required: ["requestId", "evidence"],
    additionalProperties: false,
  };
}

function evidenceBodySchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      constraint: { type: "string", minLength: 1 },
      workaround: { type: "string", minLength: 1 },
      cost: { type: "string", minLength: 1 },
      expectedImprovement: { type: "string", minLength: 1 },
      proof: { type: "string", minLength: 1 },
      taskRef: { type: "string", minLength: 1 },
      sourceRefs: textArraySchema(),
    },
    required: ["constraint", "workaround", "cost", "expectedImprovement"],
    additionalProperties: false,
  };
}

function textArraySchema(): Record<string, unknown> {
  return {
    type: "array",
    minItems: 1,
    items: { type: "string", minLength: 1 },
  };
}

function isOptionalText(value: unknown): boolean {
  return value === undefined || isText(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalTextArray(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.length > 0 && value.every(isText))
  );
}

function isOptionalInteger(value: unknown): boolean {
  return value === undefined || Number.isInteger(value);
}
