import type { AgentDomainOutcome } from "@zigil/agent-surface/outcomes"

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
  | {
      /** Compatibility with pre-domain-outcome Gonk tool results. */
      type: "review.annotation.add" | "review.passage.update"
      payload?: unknown
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

export function isAgentClientCommand(
  value: unknown,
): value is AgentClientCommand {
  if (!isRecord(value)) return false
  if (
    value.type === "review.annotation.add" ||
    value.type === "review.passage.update"
  )
    return true
  if (value.type === "ui.highlight") return isUiHighlightPayload(value.payload)
  if (value.type !== "agent.domain.outcome") return false
  if (!isRecord(value.payload)) return false
  const outcome = value.payload
  if (!isRecord(outcome.resource)) return false
  return (
    typeof outcome.id === "string" &&
    outcome.kind === "review.document.changed" &&
    typeof outcome.operation === "string" &&
    outcome.resource.kind === "review-document" &&
    typeof outcome.resource.id === "string"
  )
}
