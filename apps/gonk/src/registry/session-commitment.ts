import { shape, type ToolRegistry } from "@gonk/tool-registry"
import type { AuthContext, AuthenticatedPrincipal } from "@gonk/auth"
import type { WorkItemsRepository } from "@workspace/work-items-store/repository"
import type { ScopeBinding, Story } from "@workspace/work-items-store/types"

import { readHints, writeHints } from "./schemas.js"
import { hasOnlyKeys, isRecord } from "./validators.js"

type SessionCommitmentListInput = {
  expectedRevision?: number
}

type SessionCommitmentMutationInput = {
  workItemId: string
  expectedRevision?: number
}

type DelegationMetadata = {
  channelId?: unknown
}

const WORK_ITEMS_RESOURCE_KIND = "work-items-board"
const WORK_ITEMS_RESOURCE_ID = "work-items"
const WORK_ITEMS_OUTCOME_KIND = "work-items.changed"

type DelegatedHumanPrincipal = AuthenticatedPrincipal & {
  kind: "human"
  delegation: NonNullable<AuthenticatedPrincipal["delegation"]> & {
    actorSessionId: string
    metadata?: DelegationMetadata
  }
}

export type SessionCommitmentHomeAccess = (input: {
  homeScopeId: string
  principalId: string
  workItemId: string
}) => boolean | Promise<boolean>

const SESSION_BINDING_RELATION = "mounted-in"

const idempotentWriteHints = {
  mcp: {
    annotations: {
      ...writeHints.mcp.annotations,
      idempotent: true,
    },
  },
} as const

export function registerSessionCommitmentTools(
  registry: ToolRegistry,
  workItemsRepository: WorkItemsRepository,
  canAccessHome: SessionCommitmentHomeAccess,
): void {
  registry.register({
    name: "sigil-session-commitment-list",
    description:
      "List durable work items explicitly mounted into the current authenticated Eve application thread. Results are filtered by live authorization for each work item's canonical home.",
    visibility: "always",
    approval: "read",
    input: shape<SessionCommitmentListInput>(
      isSessionCommitmentListInput,
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
    handler: async (input, context) => {
      const principal = requireDelegatedSessionPrincipal(context.auth)
      const applicationThreadId = applicationThreadIdFor(principal)
      const sessionScopeId = sessionScopeIdFor(applicationThreadId)
      const document = await workItemsRepository.get(input.expectedRevision)
      const linked = document.stories.filter((story) =>
        hasSessionBinding(story, sessionScopeId),
      )
      const authorized = []
      for (const story of linked) {
        if (await isAuthorizedForStoryHome(principal, story, canAccessHome)) {
          authorized.push(story)
        }
      }
      return {
        data: {
          applicationThreadId,
          sessionScopeId,
          revision: document.revision,
          workItems: authorized,
        },
      }
    },
  })

  registry.register({
    name: "sigil-session-commitment-link",
    description:
      "Mount one authorized work item into the current authenticated Eve application thread. The link is idempotent and writes only a mounted-in session scope binding.",
    visibility: "always",
    approval: "write",
    input: shape<SessionCommitmentMutationInput>(
      isSessionCommitmentMutationInput,
      "Expected workItemId and optional integer expectedRevision.",
    ),
    inputJsonSchema: mutationInputSchema(),
    hints: idempotentWriteHints,
    handler: async (input, context) => {
      const principal = requireDelegatedSessionPrincipal(context.auth)
      const applicationThreadId = applicationThreadIdFor(principal)
      const sessionScopeId = sessionScopeIdFor(applicationThreadId)
      const document = await workItemsRepository.get(input.expectedRevision)
      const story = await findAuthorizedStory(
        context.auth,
        document.stories,
        input.workItemId,
        canAccessHome,
      )
      if (hasSessionBinding(story, sessionScopeId)) {
        return {
          data: {
            outcome: "already-linked",
            applicationThreadId,
            sessionScopeId,
            workItem: story,
            revision: document.revision,
            changedIds: [],
          },
        }
      }
      const result = await workItemsRepository.upsertStory(
        {
          ...story,
          scopeBindings: [
            ...story.scopeBindings,
            sessionBinding(sessionScopeId),
          ],
        },
        document.revision,
      )
      return {
        data: {
          outcome: "linked",
          applicationThreadId,
          sessionScopeId,
          workItem: findStory(result.document.stories, input.workItemId),
          revision: result.document.revision,
          changedIds: result.changedIds,
          clientCommand: workItemsChangedCommand(
            result,
            "session-commitment.link",
          ),
        },
      }
    },
  })

  registry.register({
    name: "sigil-session-commitment-unlink",
    description:
      "Remove this authenticated Eve application thread's exact mounted-in session binding from one authorized work item. Other bindings and work status are preserved.",
    visibility: "always",
    approval: "write",
    input: shape<SessionCommitmentMutationInput>(
      isSessionCommitmentMutationInput,
      "Expected workItemId and optional integer expectedRevision.",
    ),
    inputJsonSchema: mutationInputSchema(),
    hints: idempotentWriteHints,
    handler: async (input, context) => {
      const principal = requireDelegatedSessionPrincipal(context.auth)
      const applicationThreadId = applicationThreadIdFor(principal)
      const sessionScopeId = sessionScopeIdFor(applicationThreadId)
      const document = await workItemsRepository.get(input.expectedRevision)
      const story = await findAuthorizedStory(
        context.auth,
        document.stories,
        input.workItemId,
        canAccessHome,
      )
      if (!hasSessionBinding(story, sessionScopeId)) {
        return {
          data: {
            outcome: "not-linked",
            applicationThreadId,
            sessionScopeId,
            workItem: story,
            revision: document.revision,
            changedIds: [],
          },
        }
      }
      const matchingBindingIndexes = story.scopeBindings.flatMap(
        (binding, index) =>
          isSessionBinding(binding, sessionScopeId) ? [index] : [],
      )
      if (matchingBindingIndexes.length !== 1) {
        throw new Error(
          "Work item has duplicate session commitment bindings and cannot be safely unlinked.",
        )
      }
      const bindingIndex = matchingBindingIndexes[0]
      const result = await workItemsRepository.upsertStory(
        {
          ...story,
          scopeBindings: story.scopeBindings.filter(
            (_binding, index) => index !== bindingIndex,
          ),
        },
        document.revision,
      )
      return {
        data: {
          outcome: "unlinked",
          applicationThreadId,
          sessionScopeId,
          workItem: findStory(result.document.stories, input.workItemId),
          revision: result.document.revision,
          changedIds: result.changedIds,
          clientCommand: workItemsChangedCommand(
            result,
            "session-commitment.unlink",
          ),
        },
      }
    },
  })
}

function requireDelegatedSessionPrincipal(
  auth: AuthContext | undefined,
): DelegatedHumanPrincipal {
  const principal = auth?.principal
  if (
    !principal ||
    principal.kind !== "human" ||
    principal.delegation?.actorKind !== "agent" ||
    !isNonEmptyString(principal.delegation.actorSessionId) ||
    !isNonEmptyString(delegationMetadata(principal)?.channelId)
  ) {
    throw new Error(
      "Session commitment tools require a delegated authenticated human principal with trusted Eve session metadata.",
    )
  }
  return principal as DelegatedHumanPrincipal
}

function applicationThreadIdFor(principal: DelegatedHumanPrincipal): string {
  const channelId = delegationMetadata(principal)?.channelId
  if (!isNonEmptyString(channelId)) {
    throw new Error(
      "Session commitment tools require trusted Eve channel metadata.",
    )
  }
  return channelId
}

function delegationMetadata(
  principal: AuthenticatedPrincipal,
): DelegationMetadata | undefined {
  const delegation = principal.delegation as
    | (AuthenticatedPrincipal["delegation"] & {
        metadata?: DelegationMetadata
      })
    | undefined
  return delegation?.metadata
}

async function isAuthorizedForStoryHome(
  principal: DelegatedHumanPrincipal,
  story: Story,
  canAccessHome: SessionCommitmentHomeAccess,
): Promise<boolean> {
  return canAccessHome({
    homeScopeId: story.homeScopeId,
    principalId: principal.id,
    workItemId: story.id,
  })
}

async function findAuthorizedStory(
  auth: AuthContext | undefined,
  stories: readonly Story[],
  id: string,
  canAccessHome: SessionCommitmentHomeAccess,
): Promise<Story> {
  const principal = requireDelegatedSessionPrincipal(auth)
  const story = stories.find((candidate) => candidate.id === id)
  if (
    story &&
    (await isAuthorizedForStoryHome(principal, story, canAccessHome))
  ) {
    return story
  }
  throw new Error("Work item was not found or is not authorized.")
}

function sessionScopeIdFor(applicationThreadId: string): string {
  return `session:${applicationThreadId}`
}

function sessionBinding(scopeId: string): ScopeBinding {
  return { scopeId, relation: SESSION_BINDING_RELATION }
}

function hasSessionBinding(story: Story, scopeId: string): boolean {
  return story.scopeBindings.some((binding) =>
    isSessionBinding(binding, scopeId),
  )
}

function isSessionBinding(binding: ScopeBinding, scopeId: string): boolean {
  return (
    binding.scopeId === scopeId &&
    binding.relation === SESSION_BINDING_RELATION
  )
}

function findStory(stories: readonly Story[], id: string): Story {
  const story = stories.find((candidate) => candidate.id === id)
  if (!story) throw new Error(`Unknown work item id: ${id}.`)
  return story
}

function workItemsChangedCommand(
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

function mutationInputSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      workItemId: { type: "string", minLength: 1 },
      expectedRevision: { type: "integer", minimum: 0 },
    },
    required: ["workItemId"],
    additionalProperties: false,
  }
}

function isSessionCommitmentListInput(
  value: unknown,
): value is SessionCommitmentListInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["expectedRevision"]) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isSessionCommitmentMutationInput(
  value: unknown,
): value is SessionCommitmentMutationInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["workItemId", "expectedRevision"]) &&
    isNonEmptyString(value.workItemId) &&
    isOptionalInteger(value.expectedRevision)
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isOptionalInteger(value: unknown): boolean {
  return value === undefined || Number.isInteger(value)
}
