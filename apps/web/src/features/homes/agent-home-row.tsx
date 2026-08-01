import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"

import { AgentPersona } from "@/components/agents/agent-persona"
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
  // The hover card introduces the persona; the row's own avatar is a slot
  // HomeRow owns, so it stays the standalone portrait.
  const identity = {
    id: agent.personaId,
    name: agent.name,
    description: agent.headline,
    hasPortrait: agent.hasPortrait,
  }

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
        <AgentPersona.Root persona={identity}>
          <AgentPersona.Portrait size="lg" />
          <AgentPersona.Body className="gap-1">
            <AgentPersona.Name as="p" className="text-popover-foreground" />
            <AgentPersona.Description />
            <AgentPersona.Id />
          </AgentPersona.Body>
        </AgentPersona.Root>
      </HoverCardContent>
    </HoverCard>
  )
}
