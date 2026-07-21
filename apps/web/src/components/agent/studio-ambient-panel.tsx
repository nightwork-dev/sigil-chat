"use client"

// Studio's ambient commentary region — the live mount of the AmbientPanel
// variant (AGENT-OUTPUT-PROJECTION-SPEC §3.3, criterion 16). The agent's
// latest reasoning/text commentary renders here quietly over the canvas edge:
// translucent by default, darkening on hover or while the session streams.
//
// This is the ambient projector's target surface: commentary (not tool calls,
// not approvals) leaves the transcript and lives on the canvas. When the
// session has no commentary yet, the panel renders nothing — the canvas
// stays clean.

import { useMemo } from "react"

import { AmbientPanel } from "@workspace/ui/components/ambient-panel"

import { useAppAgentSession } from "@/hooks/use-app-agent-session"

export function StudioAmbientPanel() {
  const session = useAppAgentSession()

  // The latest reasoning/text part across the session, newest first. The
  // panel is a rolling digest of WHAT the agent is doing, not a transcript —
  // one excerpt, always the freshest.
  const commentary = useMemo(() => {
    for (let i = session.data.messages.length - 1; i >= 0; i--) {
      const message = session.data.messages[i]
      if (message.role !== "assistant") continue
      for (let j = message.parts.length - 1; j >= 0; j--) {
        const part = message.parts[j]
        if (part.type === "reasoning" || part.type === "text") {
          const text = part.text.trim()
          if (text.length > 0) return text
        }
      }
    }
    return null
  }, [session.data.messages])

  if (!commentary) return null

  return (
    <AmbientPanel
      className="pointer-events-auto absolute bottom-3 left-3 z-10 max-w-sm"
      label="Agent working commentary"
    >
      <p className="line-clamp-4">{commentary}</p>
    </AmbientPanel>
  )
}
