import {
  AGENT_CLIENT_COMMAND_EVENT,
  chatAgentDomainOutcomeRegistrations,
  createAgentClientCommandValidator,
  validateAgentClientCommand as validateAgentClientCommandWithRegistrations,
  type AgentClientCommand,
} from "@workspace/agent-contracts/client-command"

export {
  AGENT_CLIENT_COMMAND_EVENT,
  type AgentClientCommand,
  type AgentDomainOutcome,
} from "@workspace/agent-contracts/client-command"

export const isAgentClientCommand = createAgentClientCommandValidator(
  chatAgentDomainOutcomeRegistrations,
)

export async function validateAgentClientCommand(
  command: unknown,
): Promise<AgentClientCommand | null> {
  try {
    return await validateAgentClientCommandWithRegistrations(
      command,
      chatAgentDomainOutcomeRegistrations,
    )
  } catch {
    return null
  }
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
