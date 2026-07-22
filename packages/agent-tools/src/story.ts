import { shape, type ToolRegistry } from "@gonk/tool-registry"
import type { WorkItemsRepository } from "@workspace/work-items-store/repository"
import type {
  ReviewDecision,
  ReviewGate,
  Routing,
  Story,
  StoryComment,
  StoryFilter,
  StoryStatus,
} from "@workspace/work-items-store/types"

import { readHints, writeHints } from "./schemas.js"
import {
  hasOnlyKeys,
  isOptionalInteger,
  isOptionalText,
  isOptionalTextArray,
  isRecord,
  isText,
} from "./types.js"

const WORK_ITEMS_RESOURCE_KIND = "work-items-board"
const WORK_ITEMS_RESOURCE_ID = "work-items"
const WORK_ITEMS_OUTCOME_KIND = "work-items.changed"

type StoryListInput = { filter?: StoryFilter; expectedRevision?: number }
type StoryInspectInput = { id: string; expectedRevision?: number }
type StoryUpsertInput = { story: Story; expectedRevision?: number }
type StoryTransitionInput = {
  id: string
  status: StoryStatus
  expectedRevision?: number
}
type StoryAssignReviewInput = {
  id: string
  gate: ReviewGate
  title?: string
  summary?: string
  expectedRevision?: number
}
type StoryCommentInput = {
  storyId: string
  kind: StoryComment["kind"]
  author: string
  body: string
  addressee?: string
  parentCommentId?: string
  expectedRevision?: number
}

const storyStatuses: StoryStatus[] = [
  "idea",
  "spec",
  "ready",
  "in-progress",
  "verify",
  "shipped",
  "blocked",
]
const routings: Routing[] = [
  "self",
  "strategy",
  "design",
  "implementation",
  "research",
]
const commentKinds: StoryComment["kind"][] = [
  "question",
  "suggestion",
  "concern",
  "reference",
  "approval",
]
const reviewGates: ReviewGate[] = [
  "browser:owner",
  "decision:owner",
  "peer",
  "none",
]
const reviewDecisions: ReviewDecision[] = [
  "proposed",
  "approved",
  "changes-requested",
]

export function registerStoryTools(
  registry: ToolRegistry,
  workItemsRepository: WorkItemsRepository,
): void {
  registry.register([
    {
      name: "sigil-story-list",
      description:
        "List the current roadmap stories with their status, routing, dependencies, and review state.",
      visibility: "always",
      approval: "read",
      input: shape<StoryListInput>(
        isStoryListInput,
        "Expected optional story filters and optional integer expectedRevision.",
      ),
      inputJsonSchema: {
        type: "object",
        properties: {
          filter: {
            type: "object",
            properties: {
              worktree: { type: "string", minLength: 1 },
              epic: { type: "string", minLength: 1 },
              status: { type: "string", enum: storyStatuses },
            },
            additionalProperties: false,
          },
          expectedRevision: { type: "integer", minimum: 0 },
        },
        additionalProperties: false,
      },
      hints: readHints,
      handler: async (input) => {
        const stories = await workItemsRepository.list(input.filter)
        const document = await workItemsRepository.get(input.expectedRevision)
        return { data: { revision: document.revision, stories } }
      },
    },
    {
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
        const document = await workItemsRepository.get(input.expectedRevision)
        const story = document.stories.find(({ id }) => id === input.id)
        if (!story) throw new Error(`Unknown story id: ${input.id}.`)
        return {
          data: {
            revision: document.revision,
            story,
            comments: document.comments.filter(
              ({ storyId }) => storyId === story.id,
            ),
            reviews: document.reviews.filter(
              ({ storyId }) => storyId === story.id,
            ),
          },
        }
      },
    },
    {
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
      handler: async (input) =>
        withWorkItemsCommand(
          await workItemsRepository.upsertStory(
            input.story,
            input.expectedRevision,
          ),
          "story.upsert",
        ),
    },
    {
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
      handler: async (input) =>
        withWorkItemsCommand(
          await workItemsRepository.transitionStory(
            input.id,
            input.status,
            input.expectedRevision,
          ),
          "story.transition",
        ),
    },
    {
      name: "sigil-story-assign-review",
      description:
        "Assign the installation owner a pending review for one roadmap story. The new review item starts unread and incomplete until the owner decides it.",
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
      handler: async (input) =>
        withWorkItemsCommand(
          await workItemsRepository.assignReview(
            input.id,
            {
              assignee: "Owner",
              gate: input.gate,
              title: input.title,
              summary: input.summary,
            },
            input.expectedRevision,
          ),
          "review.assign",
        ),
    },
    {
      name: "sigil-story-comment",
      description:
        "Add a comment to one roadmap story's thread — respond to owner feedback, ask a question, or flag a concern.",
      visibility: "always",
      approval: "write",
      input: shape<StoryCommentInput>(
        isStoryCommentInput,
        "Expected a non-empty story id, a supported kind, a non-empty author and body, and optional addressee, parentCommentId, and integer expectedRevision.",
      ),
      inputJsonSchema: {
        type: "object",
        properties: {
          storyId: { type: "string", minLength: 1 },
          kind: { type: "string", enum: commentKinds },
          author: { type: "string", minLength: 1 },
          body: { type: "string", minLength: 1 },
          addressee: { type: "string", minLength: 1 },
          parentCommentId: { type: "string", minLength: 1 },
          expectedRevision: { type: "integer", minimum: 0 },
        },
        required: ["storyId", "kind", "author", "body"],
        additionalProperties: false,
      },
      hints: writeHints,
      handler: async (input) => {
        const comment: StoryComment = {
          id: crypto.randomUUID(),
          storyId: input.storyId,
          kind: input.kind,
          author: input.author,
          body: input.body,
          createdAt: new Date().toISOString(),
          ...(input.addressee ? { addressee: input.addressee } : {}),
          ...(input.parentCommentId
            ? { parentCommentId: input.parentCommentId }
            : {}),
        }
        return withWorkItemsCommand(
          await workItemsRepository.addComment(comment, input.expectedRevision),
          "story.comment",
        )
      },
    },
  ])
}

function withWorkItemsCommand(
  result: { document: { revision: number }; changedIds: string[] },
  operation: string,
) {
  return {
    data: {
      ...result,
      clientCommand: {
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
      },
    },
  }
}

function isStoryListInput(value: unknown): value is StoryListInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["filter", "expectedRevision"]) &&
    (value.filter === undefined || isStoryFilter(value.filter)) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isStoryFilter(value: unknown): value is StoryFilter {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["worktree", "epic", "status"]) &&
    isOptionalText(value.worktree) &&
    isOptionalText(value.epic) &&
    (value.status === undefined || storyStatuses.includes(value.status as never))
  )
}

function isStoryInspectInput(value: unknown): value is StoryInspectInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "expectedRevision"]) &&
    isText(value.id) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isStoryUpsertInput(value: unknown): value is StoryUpsertInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["story", "expectedRevision"]) &&
    isStory(value.story) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isStoryTransitionInput(
  value: unknown,
): value is StoryTransitionInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "status", "expectedRevision"]) &&
    isText(value.id) &&
    storyStatuses.includes(value.status as never) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isStoryAssignReviewInput(
  value: unknown,
): value is StoryAssignReviewInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "gate", "title", "summary", "expectedRevision"]) &&
    isText(value.id) &&
    reviewGates.includes(value.gate as never) &&
    isOptionalText(value.title) &&
    isOptionalText(value.summary) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isStoryCommentInput(value: unknown): value is StoryCommentInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "storyId",
      "kind",
      "author",
      "body",
      "addressee",
      "parentCommentId",
      "expectedRevision",
    ]) &&
    isText(value.storyId) &&
    commentKinds.includes(value.kind as never) &&
    isText(value.author) &&
    isText(value.body) &&
    isOptionalText(value.addressee) &&
    isOptionalText(value.parentCommentId) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isStory(value: unknown): value is Story {
  return (
    isRecord(value) &&
    isText(value.id) &&
    isText(value.epicId) &&
    isText(value.epicTitle) &&
    isText(value.title) &&
    isText(value.intent) &&
    Array.isArray(value.acceptanceCriteria) &&
    value.acceptanceCriteria.every(isText) &&
    storyStatuses.includes(value.status as never) &&
    routings.includes(value.routing as never) &&
    reviewGates.includes(value.reviewGate as never) &&
    Array.isArray(value.deps) &&
    value.deps.every((item) => typeof item === "string") &&
    isOptionalTextArray(value.sourceRefs) &&
    isOptionalText(value.assignee) &&
    (value.reviewDecision === undefined ||
      reviewDecisions.includes(value.reviewDecision as never)) &&
    isText(value.authoredBy) &&
    isText(value.createdAt) &&
    isText(value.updatedAt)
  )
}

function storySchema(): Record<string, unknown> {
  return {
    type: "object",
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
      deps: { type: "array", items: { type: "string" } },
      authoredBy: { type: "string", minLength: 1 },
      createdAt: { type: "string", minLength: 1 },
      updatedAt: { type: "string", minLength: 1 },
    },
    additionalProperties: true,
  }
}
