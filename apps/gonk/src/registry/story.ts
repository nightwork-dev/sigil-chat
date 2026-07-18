import { shape, type ToolRegistry } from "@gonk/tool-registry";
import type { WorkItemsRepository } from "@workspace/work-items-store/repository";
import type {
  ReviewDecision,
  ReviewGate,
  Routing,
  Story,
  StoryStatus,
} from "@workspace/work-items-store/types";

import { readHints, writeHints } from "./schemas.js";

const WORK_ITEMS_RESOURCE_KIND = "work-items-board";
const WORK_ITEMS_RESOURCE_ID = "work-items";
const WORK_ITEMS_OUTCOME_KIND = "work-items.changed";

type StoryListInput = {
  expectedRevision?: number;
};

type StoryInspectInput = {
  id: string;
  expectedRevision?: number;
};

type StoryUpsertInput = {
  story: Story;
  expectedRevision?: number;
};

type StoryTransitionInput = {
  id: string;
  status: StoryStatus;
  expectedRevision?: number;
};

type StoryAssignReviewInput = {
  id: string;
  gate: ReviewGate;
  title?: string;
  summary?: string;
  expectedRevision?: number;
};

const storyStatuses: StoryStatus[] = [
  "idea",
  "spec",
  "ready",
  "in-progress",
  "verify",
  "shipped",
  "blocked",
];

const routings: Routing[] = ["self", "claude:opus", "claude:sonnet", "pi:luna"];
const reviewGates: ReviewGate[] = [
  "browser:David",
  "decision:David",
  "peer",
  "none",
];
const reviewDecisions: ReviewDecision[] = [
  "proposed",
  "approved",
  "changes-requested",
];

export function registerStoryTools(
  registry: ToolRegistry,
  workItemsRepository: WorkItemsRepository,
): void {
  registry.register({
    name: "sigil-story-list",
    description:
      "List the current roadmap stories with their status, routing, dependencies, and review state.",
    visibility: "always",
    approval: "read",
    input: shape<StoryListInput>(
      isStoryListInput,
      "Expected an optional integer expectedRevision.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        expectedRevision: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
    hints: readHints,
    handler: async (input) => {
      const stories = await workItemsRepository.list(input.expectedRevision);
      const document = await workItemsRepository.get(input.expectedRevision);
      return {
        data: {
          revision: document.revision,
          stories,
        },
      };
    },
  });

  registry.register({
    name: "sigil-story-inspect",
    description:
      "Inspect one roadmap story by stable id, including its comments and review items.",
    visibility: "always",
    approval: "read",
    input: shape<StoryInspectInput>(
      isStoryInspectInput,
      "Expected a non-empty story id and optional integer expectedRevision.",
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
    handler: async (input) => {
      const document = await workItemsRepository.get(input.expectedRevision);
      const story = document.stories.find(
        (candidate) => candidate.id === input.id,
      );
      if (!story) throw new Error(`Unknown story id: ${input.id}.`);
      return {
        data: {
          revision: document.revision,
          story,
          comments: document.comments.filter(
            (comment) => comment.storyId === story.id,
          ),
          reviews: document.reviews.filter(
            (review) => review.storyId === story.id,
          ),
        },
      };
    },
  });

  registry.register({
    name: "sigil-story-upsert",
    description:
      "Create or replace a roadmap story. Inspect the existing story first when updating one, and pass its revision to avoid overwriting newer work.",
    visibility: "always",
    approval: "write",
    input: shape<StoryUpsertInput>(
      isStoryUpsertInput,
      "Expected a complete story object and optional integer expectedRevision.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        story: storySchema(),
        expectedRevision: { type: "integer", minimum: 0 },
      },
      required: ["story"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input) => {
      const result = await workItemsRepository.upsertStory(
        input.story,
        input.expectedRevision,
      );
      return {
        data: {
          ...result,
          clientCommand: clientCommand(result, "story.upsert"),
        },
      };
    },
  });

  registry.register({
    name: "sigil-story-transition",
    description:
      "Change one roadmap story's status. Inspect the story first and use its current revision when available.",
    visibility: "always",
    approval: "write",
    input: shape<StoryTransitionInput>(
      isStoryTransitionInput,
      "Expected a non-empty story id, a supported status, and an optional integer expectedRevision.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        status: { type: "string", enum: storyStatuses },
        expectedRevision: { type: "integer", minimum: 0 },
      },
      required: ["id", "status"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input) => {
      const result = await workItemsRepository.transitionStory(
        input.id,
        input.status,
        input.expectedRevision,
      );
      return {
        data: {
          ...result,
          clientCommand: clientCommand(result, "story.transition"),
        },
      };
    },
  });

  registry.register({
    name: "sigil-story-assign-review",
    description:
      "Assign David a pending review for one roadmap story. The new review item starts unread and incomplete until David decides it.",
    visibility: "always",
    approval: "write",
    input: shape<StoryAssignReviewInput>(
      isStoryAssignReviewInput,
      "Expected a non-empty story id, a supported review gate, and optional title, summary, and integer expectedRevision.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        gate: { type: "string", enum: reviewGates },
        title: { type: "string", minLength: 1 },
        summary: { type: "string", minLength: 1 },
        expectedRevision: { type: "integer", minimum: 0 },
      },
      required: ["id", "gate"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input) => {
      const result = await workItemsRepository.assignReview(
        input.id,
        {
          assignee: "David",
          gate: input.gate,
          title: input.title,
          summary: input.summary,
        },
        input.expectedRevision,
      );
      return {
        data: {
          ...result,
          clientCommand: clientCommand(result, "review.assign"),
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

function isStoryListInput(value: unknown): value is StoryListInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["expectedRevision"]) &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isStoryInspectInput(value: unknown): value is StoryInspectInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "expectedRevision"]) &&
    isNonEmptyString(value.id) &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isStoryUpsertInput(value: unknown): value is StoryUpsertInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["story", "expectedRevision"]) &&
    isStory(value.story) &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isStoryTransitionInput(value: unknown): value is StoryTransitionInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "status", "expectedRevision"]) &&
    isNonEmptyString(value.id) &&
    isStoryStatus(value.status) &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isStoryAssignReviewInput(
  value: unknown,
): value is StoryAssignReviewInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "gate",
      "title",
      "summary",
      "expectedRevision",
    ]) &&
    isNonEmptyString(value.id) &&
    isReviewGate(value.gate) &&
    isOptionalNonEmptyString(value, "title") &&
    isOptionalNonEmptyString(value, "summary") &&
    isOptionalInteger(value, "expectedRevision")
  );
}

function isStory(value: unknown): value is Story {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "epicId",
      "epicTitle",
      "title",
      "intent",
      "acceptanceCriteria",
      "status",
      "routing",
      "reviewGate",
      "deps",
      "assignee",
      "reviewDecision",
      "authoredBy",
      "createdAt",
      "updatedAt",
      "decidedBy",
      "decidedAt",
    ]) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.epicId) &&
    isNonEmptyString(value.epicTitle) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.intent) &&
    isNonEmptyStringArray(value.acceptanceCriteria) &&
    isStoryStatus(value.status) &&
    isRouting(value.routing) &&
    isReviewGate(value.reviewGate) &&
    isStringArray(value.deps, true) &&
    isOptionalNonEmptyString(value, "assignee") &&
    isOptionalReviewDecision(value, "reviewDecision") &&
    isNonEmptyString(value.authoredBy) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt) &&
    isOptionalNonEmptyString(value, "decidedBy") &&
    isOptionalNonEmptyString(value, "decidedAt")
  );
}

function storySchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      id: { type: "string", minLength: 1 },
      epicId: { type: "string", minLength: 1 },
      epicTitle: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      intent: { type: "string", minLength: 1 },
      acceptanceCriteria: {
        type: "array",
        minItems: 1,
        items: { type: "string", minLength: 1 },
      },
      status: { type: "string", enum: storyStatuses },
      routing: { type: "string", enum: routings },
      reviewGate: { type: "string", enum: reviewGates },
      deps: {
        type: "array",
        items: { type: "string" },
      },
      assignee: { type: "string", minLength: 1 },
      reviewDecision: { type: "string", enum: reviewDecisions },
      authoredBy: { type: "string", minLength: 1 },
      createdAt: { type: "string", minLength: 1 },
      updatedAt: { type: "string", minLength: 1 },
      decidedBy: { type: "string", minLength: 1 },
      decidedAt: { type: "string", minLength: 1 },
    },
    required: [
      "id",
      "epicId",
      "epicTitle",
      "title",
      "intent",
      "acceptanceCriteria",
      "status",
      "routing",
      "reviewGate",
      "deps",
      "authoredBy",
      "createdAt",
      "updatedAt",
    ],
    additionalProperties: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonEmptyString(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || isNonEmptyString(value[key]);
}

function isOptionalInteger(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return (
    value[key] === undefined ||
    (Number.isInteger(value[key]) && (value[key] as number) >= 0)
  );
}

function isStringArray(value: unknown, allowEmpty = false): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => typeof item === "string")
  );
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isNonEmptyString(item))
  );
}

function isStoryStatus(value: unknown): value is StoryStatus {
  return (
    typeof value === "string" && storyStatuses.includes(value as StoryStatus)
  );
}

function isRouting(value: unknown): value is Routing {
  return typeof value === "string" && routings.includes(value as Routing);
}

function isReviewGate(value: unknown): value is ReviewGate {
  return typeof value === "string" && reviewGates.includes(value as ReviewGate);
}

function isOptionalReviewDecision(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return (
    value[key] === undefined ||
    (typeof value[key] === "string" &&
      reviewDecisions.includes(value[key] as ReviewDecision))
  );
}
