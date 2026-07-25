"use client"

// The agent's face as a live presence — the meet-their-gaze target (VOX.7
// capability 2).
//
// It is an ordinary AgentPortrait opted in as the `agent-portrait` gaze region
// and driven by the shared acknowledgement latch: when the user's gaze rests on
// it (the capture controller feeds meet-gaze.ts), the portrait acknowledges
// being looked at. This is the ONE portrait that responds — list/card avatars
// stay plain — because meeting a gaze is about the single live presence, not
// every rendered face.

import { AgentPortrait } from "@/components/agents/agent-portrait"
import { GAZE_PORTRAIT_REGION_ID } from "@/lib/gaze/gaze-region"
import { usePortraitAcknowledged } from "@/lib/gaze/gaze-capture-store"

export function AgentPresencePortrait({
  personaId,
  name,
  hasPortrait,
  size = "sm",
  className,
}: {
  readonly personaId: string
  readonly name: string
  readonly hasPortrait: boolean
  readonly size?: "sm" | "default" | "lg"
  readonly className?: string
}) {
  const acknowledged = usePortraitAcknowledged()

  return (
    <AgentPortrait
      personaId={personaId}
      name={name}
      hasPortrait={hasPortrait}
      size={size}
      className={className}
      gazeId={GAZE_PORTRAIT_REGION_ID}
      gazeLabel={name}
      met={acknowledged}
    />
  )
}
