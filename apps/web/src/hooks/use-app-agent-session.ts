import { useCallback, useMemo } from "react"

import {
  useAgentRuntimeSession,
  useAttention,
  type AgentRuntimeSession,
} from "@niwork/agent"
import {
  clearAttentionExclusions,
  clearContextDraft,
  clearTurnContextAttachments,
  getAttentionExclusions,
  getContextDraftScope,
  getTurnContextAttachments,
  serializeAttentionDraft,
} from "@niwork/agent/context-draft"
import { getAttentionPrivacyLevel } from "@niwork/agent/context-privacy"

import {
  getToolApprovalMode,
  TOOL_APPROVAL_HEADER,
} from "@/lib/agent-tool-approval"
import {
  commitAttentionDelivery,
  pendingAttentionContext,
} from "@/lib/agent-attention-delivery"

export function useAppAgentSession(
  source?: AgentRuntimeSession,
): AgentRuntimeSession {
  const provided = useAgentRuntimeSession()
  const session = source ?? provided
  const attention = useAttention()

  const send = useCallback<AgentRuntimeSession["send"]>(
    async (input) => {
      const contextScope = getContextDraftScope()
      const pendingAttention = pendingAttentionContext(attention, contextScope)
      const attachments = getTurnContextAttachments()
      const result = await session.send({
        ...input,
        ...(pendingAttention || attachments.length > 0
          ? {
              clientContext: serializeAttentionDraft(
                pendingAttention,
                getAttentionPrivacyLevel(),
                getAttentionExclusions(),
                attachments,
              ),
            }
          : {}),
        headers: {
          ...input.headers,
          [TOOL_APPROVAL_HEADER]: getToolApprovalMode(),
        },
      })
      if (result.status === "succeeded") {
        commitAttentionDelivery(attention, contextScope)
        clearAttentionExclusions()
        clearTurnContextAttachments()
      }
      return result
    },
    [attention, session],
  )

  const reset = useCallback(() => {
    clearContextDraft()
    session.reset?.()
  }, [session])

  return useMemo(
    () => ({
      ...session,
      reset: session.capabilities.reset ? reset : undefined,
      send,
    }),
    [reset, send, session],
  )
}
