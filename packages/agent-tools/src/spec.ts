import { shape, type ToolContext, type ToolRegistry } from "@gonk/tool-registry"
import type {
  CreateSpecInput,
  ReviseSpecInput,
  SpecFilter,
  SpecsRepository,
  SpecStatus,
} from "@workspace/work-items-store/specs"

import { readHints, stringArraySchema, writeHints } from "./schemas.js"
import {
  hasOnlyKeys,
  isOptionalInteger,
  isOptionalTextArray,
  isRecord,
  isText,
} from "./types.js"

type SpecListInput = { filter?: SpecFilter; expectedRevision?: number }
type SpecInspectInput = { id: string; expectedRevision?: number }
type SpecCreateInput = Omit<CreateSpecInput, "authoredBy"> & {
  expectedRevision?: number
}
type SpecReviseInput = ReviseSpecInput & {
  id: string
  expectedRevision?: number
}
type SpecTransitionInput = {
  id: string
  status: SpecStatus
  expectedRevision?: number
}

const specStatuses: SpecStatus[] = [
  "draft",
  "review",
  "accepted",
  "superseded",
  "archived",
]

export function registerSpecTools(
  registry: ToolRegistry,
  repository: SpecsRepository,
): void {
  registry.register([
    {
      name: "sigil-spec-list",
      description:
        "List durable product specifications in the roadmap, optionally filtered by lifecycle status or linked story id.",
      visibility: "always",
      approval: "read",
      input: shape<SpecListInput>(
        isSpecListInput,
        "Expected optional status/storyId filters and an optional integer expectedRevision.",
      ),
      inputJsonSchema: {
        type: "object",
        properties: {
          filter: {
            type: "object",
            properties: {
              status: { type: "string", enum: specStatuses },
              storyId: { type: "string", minLength: 1 },
            },
            additionalProperties: false,
          },
          expectedRevision: { type: "integer", minimum: 0 },
        },
        additionalProperties: false,
      },
      hints: readHints,
      handler: async (input) => {
        const revision = await repository.revision()
        assertRevision(revision, input.expectedRevision)
        return { data: { revision, specs: await repository.list(input.filter) } }
      },
    },
    {
      name: "sigil-spec-inspect",
      description:
        "Inspect one durable product specification by stable id, including its Markdown body and linked roadmap stories.",
      visibility: "always",
      approval: "read",
      input: shape<SpecInspectInput>(
        isSpecInspectInput,
        "Expected a non-empty spec id and optional integer expectedRevision.",
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
        const revision = await repository.revision()
        assertRevision(revision, input.expectedRevision)
        const spec = await repository.get(input.id)
        if (!spec) throw new Error(`Unknown spec id: ${input.id}.`)
        return { data: { revision, spec } }
      },
    },
    {
      name: "sigil-spec-create",
      description:
        "Create a new durable product specification in draft status. This never updates an existing id; inspect or list first to avoid duplicates.",
      visibility: "always",
      approval: "write",
      input: shape<SpecCreateInput>(
        isSpecCreateInput,
        "Expected a stable id, title, summary, Markdown body, optional story/supersedes links, and optional integer expectedRevision.",
      ),
      inputJsonSchema: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          summary: { type: "string", minLength: 1 },
          body: { type: "string", minLength: 1 },
          storyIds: stringArraySchema(),
          supersedes: stringArraySchema(),
          expectedRevision: { type: "integer", minimum: 0 },
        },
        required: ["id", "title", "summary", "body"],
        additionalProperties: false,
      },
      hints: writeHints,
      handler: async (input, context) => {
        const result = await repository.create(
          {
            id: input.id,
            title: input.title,
            summary: input.summary,
            body: input.body,
            storyIds: input.storyIds,
            supersedes: input.supersedes,
            authoredBy: authorFrom(context),
          },
          input.expectedRevision,
        )
        return { data: withClientCommand(result, "spec.create") }
      },
    },
    {
      name: "sigil-spec-revise",
      description:
        "Revise an existing durable specification without changing its lifecycle status. Inspect first and pass the current revision to avoid overwriting newer work.",
      visibility: "always",
      approval: "write",
      input: shape<SpecReviseInput>(
        isSpecReviseInput,
        "Expected a non-empty spec id, at least one revised field, and optional integer expectedRevision.",
      ),
      inputJsonSchema: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          summary: { type: "string", minLength: 1 },
          body: { type: "string", minLength: 1 },
          storyIds: stringArraySchema(),
          supersedes: stringArraySchema(),
          expectedRevision: { type: "integer", minimum: 0 },
        },
        required: ["id"],
        additionalProperties: false,
      },
      hints: writeHints,
      handler: async (input) => {
        const { id, expectedRevision, ...revision } = input
        const result = await repository.revise(id, revision, expectedRevision)
        return { data: withClientCommand(result, "spec.revise") }
      },
    },
    {
      name: "sigil-spec-transition",
      description:
        "Change a durable specification's lifecycle status. Inspect it first and pass the current revision when available.",
      visibility: "always",
      approval: "write",
      input: shape<SpecTransitionInput>(
        isSpecTransitionInput,
        "Expected a non-empty spec id, supported status, and optional integer expectedRevision.",
      ),
      inputJsonSchema: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          status: { type: "string", enum: specStatuses },
          expectedRevision: { type: "integer", minimum: 0 },
        },
        required: ["id", "status"],
        additionalProperties: false,
      },
      hints: writeHints,
      handler: async (input) => {
        const result = await repository.transition(
          input.id,
          input.status,
          input.expectedRevision,
        )
        return { data: withClientCommand(result, "spec.transition") }
      },
    },
  ])
}

function withClientCommand(
  result: { revision: number; changedIds: string[]; spec: unknown },
  operation: string,
) {
  return {
    ...result,
    clientCommand: {
      type: "agent.domain.outcome" as const,
      payload: {
        id: `roadmap-specs:${operation}:${result.revision}:${result.changedIds.join(",") || "none"}`,
        kind: "roadmap-specs.changed",
        resource: {
          kind: "roadmap-specs",
          id: "roadmap-specs",
          revision: result.revision,
        },
        operation,
        changedIds: result.changedIds,
      },
    },
  }
}

function authorFrom(context: ToolContext): string {
  return context.auth?.principal.id ?? "agent"
}

function assertRevision(current: number, expected?: number): void {
  if (expected !== undefined && expected !== current)
    throw new Error(
      `Specs revision conflict: expected ${expected}, current ${current}.`,
    )
}

function isSpecListInput(value: unknown): value is SpecListInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["filter", "expectedRevision"]) &&
    (value.filter === undefined || isSpecFilter(value.filter)) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isSpecFilter(value: unknown): value is SpecFilter {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["status", "storyId"]) &&
    (value.status === undefined || specStatuses.includes(value.status as never)) &&
    (value.storyId === undefined || isText(value.storyId))
  )
}

function isSpecInspectInput(value: unknown): value is SpecInspectInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "expectedRevision"]) &&
    isText(value.id) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isSpecCreateInput(value: unknown): value is SpecCreateInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "title",
      "summary",
      "body",
      "storyIds",
      "supersedes",
      "expectedRevision",
    ]) &&
    isText(value.id) &&
    isText(value.title) &&
    isText(value.summary) &&
    isText(value.body) &&
    isOptionalTextArray(value.storyIds) &&
    isOptionalTextArray(value.supersedes) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isSpecReviseInput(value: unknown): value is SpecReviseInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "title",
      "summary",
      "body",
      "storyIds",
      "supersedes",
      "expectedRevision",
    ]) ||
    !isText(value.id) ||
    (value.title !== undefined && !isText(value.title)) ||
    (value.summary !== undefined && !isText(value.summary)) ||
    (value.body !== undefined && !isText(value.body)) ||
    !isOptionalTextArray(value.storyIds) ||
    !isOptionalTextArray(value.supersedes) ||
    !isOptionalInteger(value.expectedRevision)
  )
    return false
  return ["title", "summary", "body", "storyIds", "supersedes"].some(
    (key) => value[key] !== undefined,
  )
}

function isSpecTransitionInput(value: unknown): value is SpecTransitionInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "status", "expectedRevision"]) &&
    isText(value.id) &&
    specStatuses.includes(value.status as never) &&
    isOptionalInteger(value.expectedRevision)
  )
}
