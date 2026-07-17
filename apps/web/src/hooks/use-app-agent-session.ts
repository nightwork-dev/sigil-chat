import { useCallback, useMemo } from "react"

import {
  useAgentRuntimeSession,
  useAttention,
} from "@zigil/agent-react"
import type { AgentRuntimeSession } from "@zigil/agent-surface"
import {
  clearAttentionExclusions,
  clearContextDraft,
  clearTurnContextAttachments,
  getAttentionExclusions,
  getTurnContextAttachments,
  serializeAttentionDraft,
} from "@zigil/agent-react"
import { getAttentionPrivacyLevel } from "@zigil/agent-react"

import {
  getToolApprovalMode,
  TOOL_APPROVAL_HEADER,
} from "@/lib/agent-tool-approval"

export function useAppAgentSession(
  source?: AgentRuntimeSession,
): AgentRuntimeSession {
  const provided = useAgentRuntimeSession()
  const session = source ?? provided
  const attention = useAttention()

  const send = useCallback<AgentRuntimeSession["send"]>(
    async (input) => {
      const attachments = getTurnContextAttachments()
      const result = await session.send({
        ...input,
        ...(attention || attachments.length > 0
          ? {
              clientContext: serializeAttentionDraft(
                attention,
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
