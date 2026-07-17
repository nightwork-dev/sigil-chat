import { getAgentTargetProps } from "@/lib/agent-dom-effects"

/**
 * Marks an element as an explicit, semantically named target for agent-driven
 * emphasis. The agent never receives or supplies a CSS selector.
 */
export function useAgentTarget(targetId: string): {
  "data-agent-target": string
} {
  return getAgentTargetProps(targetId)
}
