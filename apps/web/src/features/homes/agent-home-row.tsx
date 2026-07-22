import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"

import { AgentPortrait } from "@/components/agents/agent-portrait"

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
  const avatar = (
    <AgentPortrait
      personaId={agent.personaId}
      name={agent.name}
      hasPortrait={agent.hasPortrait}
      size="sm"
    />
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
          <AgentPortrait
            personaId={agent.personaId}
            name={agent.name}
            hasPortrait={agent.hasPortrait}
            size="lg"
          />
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
