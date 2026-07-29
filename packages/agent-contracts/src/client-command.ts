import {
  AgentDomainOutcomeSchema,
  type AgentDomainOutcome,
} from "@zigil/agent/outcomes"
import {
  DuplicateAgentDomainOutcomeKindError,
  InvalidAgentDomainOutcomeError,
  UnregisteredAgentDomainOutcomeKindError,
  createAgentDomainOutcomeRegistry as createSharedAgentDomainOutcomeRegistry,
  type AgentDomainOutcomeRegistration,
  type AgentDomainOutcomeRegistry,
} from "@zigil/agent/outcome-registry"

import {
  isAgentUiHighlightAction,
  type AgentUiHighlightAction,
} from "./ui-highlight.ts"

export const AGENT_CLIENT_COMMAND_EVENT = "sigil:agent-client-command"

export {
  AgentDomainOutcomeSchema,
  DuplicateAgentDomainOutcomeKindError,
  InvalidAgentDomainOutcomeError,
  UnregisteredAgentDomainOutcomeKindError,
  type AgentDomainOutcome,
  type AgentDomainOutcomeRegistration,
  type AgentDomainOutcomeRegistry,
}

export type AgentClientCommand =
  | {
      type: "agent.domain.outcome"
      payload: AgentDomainOutcome
    }
  | {
      type: "ui.highlight"
      payload: {
        actions?: AgentUiHighlightAction[]
        clearPrevious?: boolean
      }
    }

type OutcomeSchema = AgentDomainOutcomeRegistration["schema"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isUiHighlightPayload(value: unknown): value is {
  actions?: AgentUiHighlightAction[]
  clearPrevious?: boolean
} {
  return (
    isRecord(value) &&
    (value.actions === undefined ||
      (Array.isArray(value.actions) &&
        value.actions.every(isAgentUiHighlightAction))) &&
    (value.clearPrevious === undefined ||
      typeof value.clearPrevious === "boolean")
  )
}

export function createAgentDomainOutcomeRegistration({
  kind,
  resourceKinds,
  vendor = "agent-domain-outcome",
  invalidMessage = `Expected a ${kind} outcome`,
}: {
  kind: string
  resourceKinds: readonly string[]
  vendor?: string
  invalidMessage?: string
}): AgentDomainOutcomeRegistration {
  const schema: OutcomeSchema = {
    "~standard": {
      version: 1,
      vendor,
      async validate(value) {
        const core = await AgentDomainOutcomeSchema["~standard"].validate(value)
        if (core.issues) return { issues: core.issues }

        const outcome = core.value
        if (
          outcome.kind !== kind ||
          !resourceKinds.includes(outcome.resource.kind) ||
          typeof outcome.operation !== "string" ||
          outcome.operation.length === 0
        ) {
          return { issues: [{ message: invalidMessage }] }
        }
        return { value: outcome }
      },
    },
  }

  return { kind, schema }
}

export const chatAgentDomainOutcomeRegistrations = [
  createAgentDomainOutcomeRegistration({
    kind: "review.document.changed",
    resourceKinds: ["review-document"],
    vendor: "sigil-chat",
    invalidMessage: "Expected a review document outcome",
  }),
  createAgentDomainOutcomeRegistration({
    kind: "work-items.changed",
    resourceKinds: ["work-items-board"],
    vendor: "sigil-chat",
    invalidMessage: "Expected a work-items outcome",
  }),
  createAgentDomainOutcomeRegistration({
    kind: "skills.changed",
    resourceKinds: ["skills-catalog"],
    vendor: "sigil-chat",
    invalidMessage: "Expected a skills catalog outcome",
  }),
  createAgentDomainOutcomeRegistration({
    kind: "evidence.changed",
    resourceKinds: ["evidence-room"],
    vendor: "sigil-chat",
    invalidMessage: "Expected an evidence-room outcome",
  }),
  createAgentDomainOutcomeRegistration({
    kind: "roadmap-specs.changed",
    resourceKinds: ["roadmap-specs"],
    vendor: "sigil-chat",
    invalidMessage: "Expected a roadmap specs outcome",
  }),
  createAgentDomainOutcomeRegistration({
    kind: "containers.changed",
    resourceKinds: ["project-registry", "workspace-registry"],
    vendor: "sigil-chat",
    invalidMessage: "Expected a containers outcome",
  }),
  createAgentDomainOutcomeRegistration({
    kind: "blackboard.changed",
    resourceKinds: [
      "session-blackboard",
      "workspace-blackboard",
      "project-blackboard",
    ],
    vendor: "sigil-chat",
    invalidMessage: "Expected a blackboard outcome",
  }),
] satisfies readonly AgentDomainOutcomeRegistration[]

export const defaultAgentDomainOutcomeRegistrations =
  chatAgentDomainOutcomeRegistrations

export function createAgentDomainOutcomeRegistry(
  registrations: readonly AgentDomainOutcomeRegistration[] = defaultAgentDomainOutcomeRegistrations,
): AgentDomainOutcomeRegistry {
  return createSharedAgentDomainOutcomeRegistry(registrations)
}

export async function validateAgentDomainOutcome(
  value: unknown,
  registrations: readonly AgentDomainOutcomeRegistration[] = defaultAgentDomainOutcomeRegistrations,
): Promise<AgentDomainOutcome> {
  return createAgentDomainOutcomeRegistry(registrations).validate(value)
}

export async function isAgentDomainOutcome(
  value: unknown,
  registrations: readonly AgentDomainOutcomeRegistration[] = defaultAgentDomainOutcomeRegistrations,
): Promise<boolean> {
  return createAgentDomainOutcomeRegistry(registrations).is(value)
}

export function createAgentClientCommandValidator(
  registrations: readonly AgentDomainOutcomeRegistration[] = defaultAgentDomainOutcomeRegistrations,
) {
  const registry = createAgentDomainOutcomeRegistry(registrations)
  return async (value: unknown): Promise<boolean> => {
    if (!isRecord(value)) return false
    if (value.type === "ui.highlight")
      return isUiHighlightPayload(value.payload)
    if (value.type !== "agent.domain.outcome") return false
    return registry.is(value.payload)
  }
}

export async function validateAgentClientCommand(
  value: unknown,
  registrations: readonly AgentDomainOutcomeRegistration[] = defaultAgentDomainOutcomeRegistrations,
): Promise<AgentClientCommand> {
  if (!isRecord(value)) {
    throw new TypeError("Expected an agent client command object")
  }
  if (value.type === "ui.highlight") {
    if (!isUiHighlightPayload(value.payload)) {
      throw new TypeError("Invalid ui.highlight client command payload")
    }
    return value as AgentClientCommand
  }
  if (value.type !== "agent.domain.outcome") {
    throw new TypeError(`Unknown agent client command type "${value.type}"`)
  }
  const payload = await validateAgentDomainOutcome(value.payload, registrations)
  return { type: "agent.domain.outcome", payload }
}

export async function isAgentClientCommand(
  value: unknown,
): Promise<boolean> {
  return createAgentClientCommandValidator()(value)
}
