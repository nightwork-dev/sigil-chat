import { formatAttentionLabel, type AttentionContext } from "@zigil/agent-react/attention";
import {
  hasPendingApproval,
  isAgentSessionBusy,
  type AgentApprovalPresentation,
  type AgentForkIntent,
  type AgentRuntimeSession,
  type AgentTurnResult,
} from "@zigil/agent-surface/contracts";

export type AgentHudTriggerState = "approval" | "busy" | "idle";

export function getAgentHudTriggerState(
  session: AgentRuntimeSession,
): AgentHudTriggerState {
  if (hasPendingApproval(session)) return "approval";
  if (isAgentSessionBusy(session)) return "busy";
  return "idle";
}

export function shouldClearAgentComposer(result: AgentTurnResult): boolean {
  return result.status === "succeeded";
}

export function getAgentHudTriggerLabel(
  session: AgentRuntimeSession,
  attention: AttentionContext | null,
): string {
  const state = getAgentHudTriggerState(session);
  const label = formatAttentionLabel(attention);
  if (state === "approval") return "Approval needed";
  if (state === "busy") return `Working on ${label}`;
  return `Ask about ${label}`;
}

export function getAgentHudPanelDescription(
  attention: AttentionContext | null,
): string {
  return `Context: ${formatAttentionLabel(attention)}`;
}

export function getAgentHudStatusLabel(
  status: AgentRuntimeSession["status"],
): string {
  return status === "submitted" ? "waiting" : status;
}

export function getAgentHudApprovalActions(
  approval: AgentApprovalPresentation,
): readonly string[] {
  return approval.alwaysAllow
    ? ["Allow once", "Always allow", "Deny"]
    : ["Allow once", "Deny"];
}

export function getAgentHudForkIntent(
  activeThreadId: string,
  revision?: number,
): AgentForkIntent {
  return revision === undefined
    ? { sourceThreadId: activeThreadId }
    : { sourceThreadId: activeThreadId, sourceRevision: revision };
}
