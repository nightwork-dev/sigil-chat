import type { AgentDomainOutcome } from "@sigil/agent/outcomes"

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
        actions?: unknown[]
        clearPrevious?: boolean
      }
    }
  | {
      /** Compatibility with pre-domain-outcome Gonk tool results. */
      type: "review.annotation.add" | "review.passage.update"
      payload?: unknown
    }

export function isAgentClientCommand(
  value: unknown,
): value is AgentClientCommand {
  if (!value || typeof value !== "object") return false
  const command = value as Record<string, unknown>
  if (
    command.type === "review.annotation.add" ||
    command.type === "review.passage.update"
  )
    return true
  if (command.type === "ui.highlight")
    return (
      command.payload !== null &&
      typeof command.payload === "object" &&
      (Reflect.get(command.payload, "actions") === undefined ||
        Array.isArray(Reflect.get(command.payload, "actions")))
    )
  if (command.type !== "agent.domain.outcome") return false
  if (!command.payload || typeof command.payload !== "object") return false
  const outcome = command.payload as Record<string, unknown>
  if (!outcome.resource || typeof outcome.resource !== "object") return false
  const resource = outcome.resource as Record<string, unknown>
  return (
    typeof outcome.id === "string" &&
    outcome.kind === "review.document.changed" &&
    typeof outcome.operation === "string" &&
    resource.kind === "review-document" &&
    typeof resource.id === "string"
  )
}

export function dispatchAgentClientCommand(
  command: AgentClientCommand,
): boolean {
  if (typeof window === "undefined") return false
  window.dispatchEvent(
    new CustomEvent<AgentClientCommand>(AGENT_CLIENT_COMMAND_EVENT, {
      detail: command,
    }),
  )
  return true
}
