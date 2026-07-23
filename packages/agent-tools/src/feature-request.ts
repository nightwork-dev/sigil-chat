import { shape, type ToolRegistry } from "@gonk/tool-registry"
import type { WorkItemsRepository } from "@workspace/work-items-store/repository"
import type { FeatureRequestProposalInput } from "@workspace/work-items-store/types"

import { writeHints } from "./schemas.js"
import {
  hasOnlyKeys,
  isOptionalText,
  isOptionalTextArray,
  isRecord,
  isText,
  requireScopeAccess,
  resolveAgentSessionId,
  resolveTargetScope,
  toHostContext,
} from "./types.js"

const WORK_ITEMS_RESOURCE_KIND = "work-items-board"
const WORK_ITEMS_RESOURCE_ID = "work-items"
const WORK_ITEMS_OUTCOME_KIND = "work-items.changed"

type FeatureRequestToolInput = FeatureRequestProposalInput

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
      "Expected title, problem, desiredOutcome, and optional evidence/sourceRefs/intendedScopeId/proposedSponsorPrincipalId. Provenance, actor, session, timestamps, status, priority, assignment, approval, and revision control are server-derived or unavailable here.",
    ),
    inputJsonSchema: featureRequestSchema(),
    hints: writeHints,
    handler: async (input, context) => {
      const target = resolveTargetScope(
        input.intendedScopeId,
        toHostContext(context.host),
        "Feature request",
      )
      const principal = await requireScopeAccess(
        context.auth,
        target,
        "Feature request",
      )
      const result = await workItemsRepository.proposeFeatureRequest(
        {
          ...input,
          intendedScopeId: target.id,
        },
        {
          actorPrincipalId: principal.id,
          agentSessionId: resolveAgentSessionId(principal, "Feature request"),
          currentScopeId: target.id,
          now: new Date().toISOString(),
        },
      )
      if (result.outcome === "duplicate") {
        return {
          data: {
            outcome: "duplicate",
            duplicateDecision: result.duplicateDecision,
            candidates: result.candidates,
            changedIds: [],
          },
        }
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
      }
    },
  })
}

export function featureRequestSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1 },
      problem: { type: "string", minLength: 1 },
      desiredOutcome: { type: "string", minLength: 1 },
      evidence: textArraySchema(),
      sourceRefs: textArraySchema(),
      intendedScopeId: { type: "string", minLength: 1 },
      proposedSponsorPrincipalId: { type: "string", minLength: 1 },
    },
    required: ["title", "problem", "desiredOutcome"],
    additionalProperties: false,
  }
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
  }
}

function isFeatureRequestToolInput(
  value: unknown,
): value is FeatureRequestToolInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "title",
      "problem",
      "desiredOutcome",
      "evidence",
      "sourceRefs",
      "intendedScopeId",
      "proposedSponsorPrincipalId",
    ]) &&
    isText(value.title) &&
    isText(value.problem) &&
    isText(value.desiredOutcome) &&
    isOptionalTextArray(value.evidence) &&
    isOptionalTextArray(value.sourceRefs) &&
    isOptionalText(value.intendedScopeId) &&
    isOptionalText(value.proposedSponsorPrincipalId)
  )
}

function textArraySchema(): Record<string, unknown> {
  return {
    type: "array",
    minItems: 1,
    items: { type: "string", minLength: 1 },
  }
}
