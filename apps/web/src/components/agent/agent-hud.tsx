import type { ComponentProps, ReactNode } from "react"

import { AgentHud as SigilAgentHud } from "@workspace/ui/components/agent-hud"

import { AgentChat, type AgentChatProps } from "@/components/agent/agent-chat"

function Root(props: ComponentProps<typeof SigilAgentHud.Root>) {
  return <SigilAgentHud.Root {...props} />
}

function Trigger(props: ComponentProps<typeof SigilAgentHud.Trigger>) {
  return <SigilAgentHud.Trigger {...props} />
}

function Panel({
  chatProps,
  children,
  ...props
}: ComponentProps<typeof SigilAgentHud.Panel> & {
  chatProps?: Omit<AgentChatProps, "session">
  children?: ReactNode
}) {
  return (
    <SigilAgentHud.Panel {...props}>
      {children ?? (
        <AgentChat
          {...chatProps}
          showStatusIndicator={false}
          statusLine={null}
        />
      )}
    </SigilAgentHud.Panel>
  )
}

export const AgentHud = { Root, Trigger, Panel }
