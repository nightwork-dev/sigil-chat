import type { AgentDomainOutcome } from "@zigil/agent/outcomes"

import {
  isAgentUiHighlightAction,
  type AgentUiHighlightAction,
} from "./ui-highlight"

export const AGENT_CLIENT_COMMAND_EVENT = "sigil:agent-client-command"

export type { AgentDomainOutcome }

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

export type StandardSchemaV1Issue = {
  message: string
  path?: ReadonlyArray<PropertyKey>
}

export type StandardSchemaV1<TValue> = {
  "~standard": {
    version: 1
    vendor: string
    validate(
      value: unknown,
    ): { value: TValue } | { issues: ReadonlyArray<StandardSchemaV1Issue> }
  }
}

export type AgentDomainOutcomeRegistration = {
  kind: string
  schema: StandardSchemaV1<AgentDomainOutcome>
}

export class DuplicateAgentDomainOutcomeKindError extends Error {
  constructor(kind: string) {
    super(`Duplicate agent domain outcome registration for "${kind}"`)
    this.name = "DuplicateAgentDomainOutcomeKindError"
  }
}

export class UnregisteredAgentDomainOutcomeKindError extends Error {
  constructor(kind: string) {
    super(`Unregistered agent domain outcome kind "${kind}"`)
    this.name = "UnregisteredAgentDomainOutcomeKindError"
  }
}

export class InvalidAgentDomainOutcomeError extends Error {
  constructor(
    kind: string,
    readonly issues: ReadonlyArray<StandardSchemaV1Issue>,
  ) {
    super(
      `Invalid agent domain outcome "${kind}": ${issues
        .map((issue) => issue.message)
        .join("; ")}`,
    )
    this.name = "InvalidAgentDomainOutcomeError"
  }
}

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

function baseOutcomeIssue(
  message: string,
  path?: ReadonlyArray<PropertyKey>,
): { issues: ReadonlyArray<StandardSchemaV1Issue> } {
  return { issues: [{ message, path }] }
}

function validateBaseOutcome(
  value: unknown,
):
  | { value: AgentDomainOutcome }
  | { issues: ReadonlyArray<StandardSchemaV1Issue> } {
  if (!isRecord(value)) {
    return baseOutcomeIssue("Expected an outcome object")
  }
  if (!isRecord(value.resource)) {
    return baseOutcomeIssue("Expected an outcome resource object", [
      "resource",
    ])
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    return baseOutcomeIssue("Expected a non-empty outcome id", ["id"])
  }
  if (typeof value.kind !== "string" || value.kind.length === 0) {
    return baseOutcomeIssue("Expected a non-empty outcome kind", ["kind"])
  }
  if (typeof value.operation !== "string" || value.operation.length === 0) {
    return baseOutcomeIssue("Expected a non-empty outcome operation", [
      "operation",
    ])
  }
  if (
    typeof value.resource.kind !== "string" ||
    value.resource.kind.length === 0
  ) {
    return baseOutcomeIssue("Expected a non-empty resource kind", [
      "resource",
      "kind",
    ])
  }
  if (typeof value.resource.id !== "string" || value.resource.id.length === 0) {
    return baseOutcomeIssue("Expected a non-empty resource id", [
      "resource",
      "id",
    ])
  }
  return { value: value as unknown as AgentDomainOutcome }
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
  return {
    kind,
    schema: {
      "~standard": {
        version: 1,
        vendor,
        validate(value) {
          const base = validateBaseOutcome(value)
          if ("issues" in base) return base
          const outcome = base.value
          if (
            outcome.kind !== kind ||
            !resourceKinds.includes(outcome.resource.kind)
          ) {
            return { issues: [{ message: invalidMessage }] }
          }
          return { value: outcome }
        },
      },
    },
  }
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
) {
  const byKind = new Map<string, AgentDomainOutcomeRegistration>()
  const registrationList = [...registrations]
  for (const registration of registrationList) {
    if (byKind.has(registration.kind)) {
      throw new DuplicateAgentDomainOutcomeKindError(registration.kind)
    }
    byKind.set(registration.kind, registration)
  }

  const validate = (value: unknown): AgentDomainOutcome => {
    const base = validateBaseOutcome(value)
    if ("issues" in base) {
      throw new InvalidAgentDomainOutcomeError("unknown", base.issues)
    }
    const registration = byKind.get(base.value.kind)
    if (!registration) {
      throw new UnregisteredAgentDomainOutcomeKindError(base.value.kind)
    }
    const result = registration.schema["~standard"].validate(value)
    if ("issues" in result) {
      throw new InvalidAgentDomainOutcomeError(base.value.kind, result.issues)
    }
    return result.value
  }

  return {
    registrations: registrationList,
    validate,
    is(value: unknown): value is AgentDomainOutcome {
      try {
        validate(value)
        return true
      } catch {
        return false
      }
    },
  }
}

export type AgentDomainOutcomeRegistry = ReturnType<
  typeof createAgentDomainOutcomeRegistry
>

export function validateAgentDomainOutcome(
  value: unknown,
  registrations: readonly AgentDomainOutcomeRegistration[] = defaultAgentDomainOutcomeRegistrations,
): AgentDomainOutcome {
  return createAgentDomainOutcomeRegistry(registrations).validate(value)
}

export function isAgentDomainOutcome(
  value: unknown,
  registrations: readonly AgentDomainOutcomeRegistration[] = defaultAgentDomainOutcomeRegistrations,
): value is AgentDomainOutcome {
  return createAgentDomainOutcomeRegistry(registrations).is(value)
}

export function createAgentClientCommandValidator(
  registrations: readonly AgentDomainOutcomeRegistration[] = defaultAgentDomainOutcomeRegistrations,
) {
  const registry = createAgentDomainOutcomeRegistry(registrations)
  return (value: unknown): value is AgentClientCommand => {
    if (!isRecord(value)) return false
    if (value.type === "ui.highlight")
      return isUiHighlightPayload(value.payload)
    if (value.type !== "agent.domain.outcome") return false
    try {
      registry.validate(value.payload)
      return true
    } catch {
      return false
    }
  }
}

export function validateAgentClientCommand(
  value: unknown,
  registrations: readonly AgentDomainOutcomeRegistration[] = defaultAgentDomainOutcomeRegistrations,
): AgentClientCommand {
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
  validateAgentDomainOutcome(value.payload, registrations)
  return value as AgentClientCommand
}

export function isAgentClientCommand(
  value: unknown,
): value is AgentClientCommand {
  return createAgentClientCommandValidator()(value)
}
