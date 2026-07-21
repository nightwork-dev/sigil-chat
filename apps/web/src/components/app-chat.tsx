import { AgentChat } from "@/components/agent/agent-chat"
import { useRegisterAgentPresentation } from "@/lib/agent-surface-registry"
import {
  setToolApprovalMode,
  useToolApprovalMode,
} from "@/lib/agent-tool-approval"

export function AppChat() {
  const approvalMode = useToolApprovalMode()
  // §4.1 — this ROUTE is the full conversation; registering at the route
  // (not inside AgentChat, which the dock also renders) suppresses the shell
  // dock structurally for exactly as long as this route is mounted.
  useRegisterAgentPresentation("full")

  return (
    <AgentChat
      approvalMode={approvalMode}
      onApprovalModeChange={setToolApprovalMode}
      placeholder="Ask the agent, or tell it to use a Gonk tool…"
    />
  )
}
