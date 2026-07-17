import type { ComponentProps, ReactNode } from "react"
import { BotIcon } from "lucide-react"

import {
  formatAttentionLabel,
  hasPendingApproval,
  isAgentSessionBusy,
  useAgentRuntimeSession,
  useAttention,
} from "@niwork/agent"
import { FloatingDock } from "@workspace/ui/components/floating-dock"
import { StatusDot } from "@workspace/ui/components/status-dot"

import {
  AgentChat,
  AgentStatusIndicator,
  type AgentChatProps,
} from "@/components/agent/agent-chat"

type RootProps = ComponentProps<typeof FloatingDock.Root>

function Root(props: RootProps) {
  return <FloatingDock.Root {...props} />
}

function Trigger({ children }: { children?: ReactNode }) {
  const session = useAgentRuntimeSession()
  const attention = useAttention()
  const approvalNeeded = hasPendingApproval(session)
  const busy = isAgentSessionBusy(session)
  const label = formatAttentionLabel(attention)

  return (
    <FloatingDock.Trigger
      aria-label={
        approvalNeeded
          ? "Approval needed"
          : busy
            ? `Agent working on ${label}`
            : `Ask about ${label}`
      }
      className="h-11 rounded-full shadow-lg"
    >
      {approvalNeeded ? (
        <StatusDot label="approval needed" pulse="pulse" status="destructive" />
      ) : busy ? (
        <StatusDot label="agent working" pulse="pulse" status="primary" />
      ) : (
        <BotIcon className="size-4 text-primary" />
      )}
      <span className="truncate">
        {children ??
          (approvalNeeded
            ? "Approval needed"
            : busy
              ? `Working on ${label}`
              : `Ask about ${label}`)}
      </span>
    </FloatingDock.Trigger>
  )
}

function Panel({
  actions,
  chatProps,
  children,
  ...props
}: Omit<ComponentProps<typeof FloatingDock.Panel>, "actions"> & {
  actions?: ReactNode
  chatProps?: Omit<AgentChatProps, "session">
}) {
  const session = useAgentRuntimeSession()
  const attention = useAttention()

  return (
    <FloatingDock.Panel
      actions={
        <>
          <AgentStatusIndicator showLabel={false} status={session.status} />
          {actions}
        </>
      }
      description={`Context: ${formatAttentionLabel(attention)}`}
      heading="Agent HUD"
      {...props}
    >
      {children ?? (
        <AgentChat
          {...chatProps}
          session={session}
          showStatusIndicator={false}
          statusLine={null}
        />
      )}
    </FloatingDock.Panel>
  )
}

function Expand(props: ComponentProps<typeof FloatingDock.Expand>) {
  return <FloatingDock.Expand {...props} />
}

export const AgentHud = { Root, Trigger, Panel, Expand }
