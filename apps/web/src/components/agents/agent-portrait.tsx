import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { cn } from "@workspace/ui/lib/utils"

import { agentPortraitUrl } from "@/lib/agent-profile"

export function AgentPortrait({
  personaId,
  name,
  hasPortrait,
  size = "default",
  className,
  fallbackClassName,
  gazeId,
  gazeLabel,
  met = false,
}: {
  readonly personaId: string
  readonly name: string
  readonly hasPortrait: boolean
  readonly size?: "sm" | "default" | "lg"
  readonly className?: string
  readonly fallbackClassName?: string
  /** When set, this portrait opts in as a gaze region (VOX.7 meet-their-gaze):
   *  the capture loop can resolve gaze onto it, and `met` drives its response.
   *  Omitted everywhere gaze is irrelevant, so existing usages are unchanged. */
  readonly gazeId?: string
  readonly gazeLabel?: string
  /** True while the user has met this portrait's gaze — renders a soft
   *  presence acknowledgement. Purely a function of state, so a glance that
   *  isn't held shows nothing. */
  readonly met?: boolean
}) {
  const portraitUrl = agentPortraitUrl(personaId, hasPortrait)

  const avatar = (
    <Avatar
      size={size}
      className={cn(
        // The acknowledgement: a soft primary ring that appears ONLY while
        // gaze is met — motion (the ring fading in) encodes the met/unmet
        // transition, and primary is the app's one "active presence" tone.
        gazeId && "transition-shadow duration-300",
        met && "ring-2 ring-primary/60 ring-offset-1 ring-offset-background",
        className,
      )}
      aria-hidden
    >
      {portraitUrl ? <AvatarImage src={portraitUrl} alt="" /> : null}
      <AvatarFallback className={cn(fallbackClassName)}>
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )

  if (!gazeId) return avatar

  // A wrapper carries the gaze opt-in as data attributes elementFromPoint can
  // resolve; the ring lives on the avatar itself.
  return (
    <span
      className="inline-flex rounded-full"
      data-gaze-id={gazeId}
      data-gaze-label={gazeLabel ?? name}
    >
      {avatar}
    </span>
  )
}
