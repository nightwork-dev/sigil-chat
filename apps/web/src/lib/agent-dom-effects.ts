// Thin adapter mapping the agent contract (@workspace/agent-contracts'
// AgentUiHighlightAction) onto the generic @workspace/ui imperative-emphasis
// engine. Preserves the existing wire contract — the `data-agent-target`
// attribute and the `sigil:agent-dom-command` event — so `useAgentTarget`,
// `getAgentTargetProps`, and the outcome projector don't have to change. See
// Shared imperative-emphasis contract from the Sigil Design ingress cores.
import {
  agentUiHighlightEffects,
  isAgentTargetId,
  isAgentUiHighlightAction,
  type AgentUiHighlightAction,
  type AgentUiHighlightEffect,
} from "@workspace/agent-contracts/ui-highlight"
import {
  clearEmphasis,
  emphasize,
  emphasizeBatch,
  getEmphasisTargetProps,
  isEmphasisCommand,
  normalizeEmphasisCommand,
  type EmphasisCommand,
  type EmphasisCommandEventDetail,
} from "@workspace/ui/lib/imperative-emphasis"

export { isAgentTargetId } from "@workspace/agent-contracts/ui-highlight"

export const AGENT_DOM_COMMAND_EVENT = "sigil:agent-dom-command"
export const AGENT_TARGET_ATTRIBUTE = "data-agent-target"

export const agentDomEffects = agentUiHighlightEffects

export type AgentDomEffect = AgentUiHighlightEffect
export type AgentDomScroll = "none" | "nearest" | "center"

export interface AgentDomCommand extends AgentUiHighlightAction {
  durationMs?: number
  scroll?: AgentDomScroll
}

export interface AgentDomBatchOptions {
  clearPrevious?: boolean
}

export type AgentDomCommandEventDetail = EmphasisCommandEventDetail

export function isAgentDomCommand(value: unknown): value is AgentDomCommand {
  return (
    !!value &&
    typeof value === "object" &&
    isAgentUiHighlightAction(value) &&
    isEmphasisCommand(value as unknown as EmphasisCommand)
  )
}

export function normalizeAgentDomCommand(
  command: AgentDomCommand,
): AgentDomCommand {
  return normalizeEmphasisCommand(command)
}

export function dispatchAgentDomCommand(command: AgentDomCommand): boolean {
  return emphasize(command, { eventName: AGENT_DOM_COMMAND_EVENT })
}

export function dispatchAgentDomCommands(
  commands: AgentDomCommand[],
  options: AgentDomBatchOptions = {},
): boolean {
  return emphasizeBatch(commands, {
    ...options,
    eventName: AGENT_DOM_COMMAND_EVENT,
  })
}

export function clearAgentDomEffects(): boolean {
  return clearEmphasis({ eventName: AGENT_DOM_COMMAND_EVENT })
}

export function getAgentTargetProps(targetId: string): {
  "data-agent-target": string
} {
  if (!isAgentTargetId(targetId)) {
    throw new Error(
      `Invalid agent target ID "${targetId}". Use a stable semantic ID containing only letters, numbers, colon, period, underscore, slash, or hyphen.`,
    )
  }

  return getEmphasisTargetProps(targetId, AGENT_TARGET_ATTRIBUTE) as {
    "data-agent-target": string
  }
}
