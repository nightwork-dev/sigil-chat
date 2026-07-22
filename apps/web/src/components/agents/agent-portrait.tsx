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
}: {
  readonly personaId: string
  readonly name: string
  readonly hasPortrait: boolean
  readonly size?: "sm" | "default" | "lg"
  readonly className?: string
  readonly fallbackClassName?: string
}) {
  const portraitUrl = agentPortraitUrl(personaId, hasPortrait)

  return (
    <Avatar size={size} className={className} aria-hidden>
      {portraitUrl ? <AvatarImage src={portraitUrl} alt="" /> : null}
      <AvatarFallback className={cn(fallbackClassName)}>
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}
