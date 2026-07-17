import { AgentChat } from "@/components/agent/agent-chat"
import {
  setToolApprovalMode,
  useToolApprovalMode,
} from "@/lib/agent-tool-approval"

export function AppChat() {
  const approvalMode = useToolApprovalMode()

  return (
    <AgentChat
      approvalMode={approvalMode}
      onApprovalModeChange={setToolApprovalMode}
      placeholder="Ask the agent, or tell it to use a Gonk tool…"
    />
  )
}
