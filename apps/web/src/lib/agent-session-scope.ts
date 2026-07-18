export const AGENT_SCOPE_HEADER = "x-sigil-scope"
/** Alias retained for callers whose variable name still says session. */
export const AGENT_SESSION_SCOPE_HEADER = AGENT_SCOPE_HEADER
export const LEGACY_AGENT_SESSION_SCOPE_HEADER = "x-sigil-session-id"

export function sessionResourceScope(id: string): string {
  return `session:${id}`
}
