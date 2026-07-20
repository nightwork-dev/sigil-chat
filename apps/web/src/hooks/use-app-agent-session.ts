import { useCallback, useMemo } from "react"

import { useAgentRuntimeSession } from "@zigil/agent-react/session"
import type { AgentRuntimeSession } from "@zigil/agent-surface/contracts"
import { useAttention } from "@zigil/agent-react/attention"
import {
  clearAttentionExclusions,
  clearContextDraft,
  clearTurnContextAttachments,
  getAttentionExclusions,
  getContextDraftScope,
  getTurnContextAttachments,
  serializeAttentionDraft,
} from "@zigil/agent-react/context-draft"
import { getAttentionPrivacyLevel } from "@zigil/agent-react/context-privacy"

import {
  getToolApprovalHeaderValue,
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
          [TOOL_APPROVAL_HEADER]: getToolApprovalHeaderValue(),
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
