export const AGENT_SCOPE_HEADER = "x-sigil-scope"
export const AGENT_PERSONA_HEADER = "x-sigil-persona-id"

export function sessionResourceScope(id: string): string {
  return `session:${id}`
}
