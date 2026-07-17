import type { AgentMcpAuthorizationPolicy } from "@sigil/agent-gonk"

export const authorizeSigilMcpRequest: AgentMcpAuthorizationPolicy = () => {
  // Sigil currently exposes one trusted service principal: possession of
  // the bearer permits application-tool authorization, while operation
  // risk and user consent remain the registry ApprovalProvider's job.
  return {
    outcome: "allow",
    reason: "Authenticated Sigil MCP principals may access application tools",
  }
}
