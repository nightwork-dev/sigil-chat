import {
  agentUiHighlightEffects,
  isAgentTargetId,
  isAgentUiHighlightAction,
  type AgentUiHighlightAction,
  type AgentUiHighlightEffect,
} from "@workspace/agent-contracts/ui-highlight"

export { isAgentTargetId } from "@workspace/agent-contracts/ui-highlight"

export const AGENT_DOM_COMMAND_EVENT = "sigil:agent-dom-command"

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

export type AgentDomCommandEventDetail =
  | { action: "apply"; command: AgentDomCommand }
  | {
      action: "apply-batch"
      commands: AgentDomCommand[]
      clearPrevious: boolean
    }
  | { action: "clear" }

const MIN_DURATION_MS = 300
const MAX_DURATION_MS = 10_000
const DEFAULT_DURATION_MS = 2_500

export function isAgentDomCommand(value: unknown): value is AgentDomCommand {
  if (!value || typeof value !== "object" || !isAgentUiHighlightAction(value))
    return false

  const command = value as unknown as Record<string, unknown>

  return (
    (command.durationMs === undefined ||
      (typeof command.durationMs === "number" &&
        Number.isFinite(command.durationMs))) &&
    (command.scroll === undefined ||
      command.scroll === "none" ||
      command.scroll === "nearest" ||
      command.scroll === "center")
  )
}

export function normalizeAgentDomCommand(
  command: AgentDomCommand,
): AgentDomCommand {
  return {
    ...command,
    targetIds: [...new Set(command.targetIds)],
    durationMs: Math.min(
      MAX_DURATION_MS,
      Math.max(MIN_DURATION_MS, command.durationMs ?? DEFAULT_DURATION_MS),
    ),
    scroll: command.scroll ?? "nearest",
  }
}

export function dispatchAgentDomCommand(command: AgentDomCommand): boolean {
  if (typeof window === "undefined" || !isAgentDomCommand(command)) return false

  window.dispatchEvent(
    new CustomEvent<AgentDomCommandEventDetail>(AGENT_DOM_COMMAND_EVENT, {
      detail: { action: "apply", command: normalizeAgentDomCommand(command) },
    }),
  )
  return true
}

export function dispatchAgentDomCommands(
  commands: AgentDomCommand[],
  options: AgentDomBatchOptions = {},
): boolean {
  if (
    typeof window === "undefined" ||
    commands.length === 0 ||
    commands.length > 50 ||
    !commands.every(isAgentDomCommand)
  ) {
    return false
  }

  window.dispatchEvent(
    new CustomEvent<AgentDomCommandEventDetail>(AGENT_DOM_COMMAND_EVENT, {
      detail: {
        action: "apply-batch",
        commands: commands.map(normalizeAgentDomCommand),
        clearPrevious: options.clearPrevious ?? true,
      },
    }),
  )
  return true
}

export function clearAgentDomEffects(): boolean {
  if (typeof window === "undefined") return false

  window.dispatchEvent(
    new CustomEvent<AgentDomCommandEventDetail>(AGENT_DOM_COMMAND_EVENT, {
      detail: { action: "clear" },
    }),
  )
  return true
}

export function getAgentTargetProps(targetId: string): {
  "data-agent-target": string
} {
  if (!isAgentTargetId(targetId)) {
    throw new Error(
      `Invalid agent target ID "${targetId}". Use a stable semantic ID containing only letters, numbers, colon, period, underscore, slash, or hyphen.`,
    )
  }

  return { "data-agent-target": targetId }
}
