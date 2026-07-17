import {
  AGENT_CLIENT_COMMAND_EVENT,
  type AgentClientCommand,
} from "@workspace/agent-contracts/client-command"

export {
  AGENT_CLIENT_COMMAND_EVENT,
  isAgentClientCommand,
  type AgentClientCommand,
  type AgentDomainOutcome,
} from "@workspace/agent-contracts/client-command"

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
