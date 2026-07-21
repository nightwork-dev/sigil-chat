import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"

import { agentPortraitUrl } from "@/lib/agent-profile"

import { HomeRow } from "./home-row"
import type { AgentRow } from "./types"

export function AgentHomeRow({
  agent,
  compact,
  first,
}: {
  readonly agent: AgentRow
  readonly compact?: boolean
  readonly first?: boolean
}) {
  const portraitUrl = agentPortraitUrl(agent.personaId, agent.hasPortrait)
  const initial = agent.name.slice(0, 1).toUpperCase()
  const avatar = (
    <Avatar size="sm" aria-hidden>
      {portraitUrl ? <AvatarImage src={portraitUrl} alt="" /> : null}
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  )

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <HomeRow
            first={first}
            compact={compact}
            title={agent.name}
            href={`/agents/${agent.personaId}`}
            leading={avatar}
          />
        }
      />
      <HoverCardContent align="start" side="right" className="w-72 p-3">
        <div className="flex items-start gap-3">
          <Avatar size="lg" aria-hidden>
            {portraitUrl ? <AvatarImage src={portraitUrl} alt="" /> : null}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-popover-foreground">{agent.name}</p>
            {agent.headline ? (
              <p className="text-sm text-muted-foreground">{agent.headline}</p>
            ) : null}
            <p className="font-mono text-[10px] text-muted-foreground">
              {agent.personaId}
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
