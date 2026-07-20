export const AGENT_SCOPE_HEADER = "x-sigil-scope"
export const AGENT_PERSONA_HEADER = "x-sigil-persona-id"
/** Alias retained for callers whose variable name still says session. */
export const AGENT_SESSION_SCOPE_HEADER = AGENT_SCOPE_HEADER
export const LEGACY_AGENT_SESSION_SCOPE_HEADER = "x-sigil-session-id"

export function sessionResourceScope(id: string): string {
  return `session:${id}`
}
