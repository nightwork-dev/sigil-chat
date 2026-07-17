export const agentUiHighlightEffects = [
  "focus",
  "pulse",
  "dim-others",
  "trace",
] as const

export type AgentUiHighlightEffect = (typeof agentUiHighlightEffects)[number]

export interface AgentUiHighlightAction {
  targetIds: string[]
  effect: AgentUiHighlightEffect
}

export interface AgentUiHighlightInput {
  actions: AgentUiHighlightAction[]
  clearPrevious?: boolean
}

const TARGET_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,127}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

export function isAgentTargetId(value: unknown): value is string {
  return typeof value === "string" && TARGET_ID_PATTERN.test(value)
}

export function isAgentUiHighlightEffect(
  value: unknown,
): value is AgentUiHighlightEffect {
  return (
    typeof value === "string" &&
    agentUiHighlightEffects.includes(value as AgentUiHighlightEffect)
  )
}

export function isAgentUiHighlightAction(
  value: unknown,
): value is AgentUiHighlightAction {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["targetIds", "effect"]) &&
    Array.isArray(value.targetIds) &&
    value.targetIds.length > 0 &&
    value.targetIds.length <= 50 &&
    value.targetIds.every(isAgentTargetId) &&
    isAgentUiHighlightEffect(value.effect)
  )
}

export function isAgentUiHighlightInput(
  value: unknown,
): value is AgentUiHighlightInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["actions", "clearPrevious"]) &&
    Array.isArray(value.actions) &&
    value.actions.length > 0 &&
    value.actions.every(isAgentUiHighlightAction) &&
    (value.clearPrevious === undefined ||
      typeof value.clearPrevious === "boolean")
  )
}
