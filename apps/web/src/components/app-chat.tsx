import { AgentChat, AgentChatHeader } from "@/components/agent/agent-chat"
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
      hideHeader
      onApprovalModeChange={setToolApprovalMode}
      placeholder="Ask the agent, or tell it to use a Gonk tool…"
    />
  )
}

/** The chat surface's top-rail content — the SAME header AgentChat would
 *  render inline, hoisted into the shell's rail (declared in chat.tsx's
 *  staticData.rail.top). One header, one rail. */
export function ChatRailTop() {
  const approvalMode = useToolApprovalMode()
  return (
    <AgentChatHeader
      approvalMode={approvalMode}
      onApprovalModeChange={setToolApprovalMode}
      variant="rail"
    />
  )
}
